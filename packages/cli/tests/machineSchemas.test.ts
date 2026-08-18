import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { formatJsonFailure, formatJsonSuccess } from '../src/core/jsonEnvelope.js';
import { setCliEnv } from '../src/core/env.js';
import { formatBatchProgressLine } from '../src/services/batch/progress.js';
import { parseBatchConfig } from '../src/services/batch/config.js';
import { createBatchReport } from '../src/services/batch/report.js';
import { verificationLoginInvocation } from '../scripts/lib/verification-credentials.mjs';

type JsonSchema = boolean | Record<string, unknown>;

const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemasRoot = path.join(cliRoot, 'schemas');

function readSchema(name: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(schemasRoot, name), 'utf8')) as Record<string, unknown>;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function resolvePointer(root: Record<string, unknown>, pointer: string): JsonSchema {
  if (!pointer.startsWith('#/')) throw new Error(`Only local JSON Schema refs are supported: ${pointer}`);
  return pointer
    .slice(2)
    .split('/')
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], root) as JsonSchema;
}

function assertSchemaValue(
  schema: JsonSchema,
  value: unknown,
  root: Record<string, unknown>,
  location = '$',
): void {
  if (schema === true) return;
  if (schema === false) throw new Error(`${location}: schema rejected value`);
  if (typeof schema.$ref === 'string') {
    assertSchemaValue(resolvePointer(root, schema.$ref), value, root, location);
    return;
  }
  if ('const' in schema && !jsonEqual(value, schema.const)) {
    throw new Error(`${location}: expected const ${JSON.stringify(schema.const)}`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonEqual(item, value))) {
    throw new Error(`${location}: value is outside enum`);
  }
  if (Array.isArray(schema.oneOf)) {
    const matches = schema.oneOf.filter((candidate) => {
      try {
        assertSchemaValue(candidate as JsonSchema, value, root, location);
        return true;
      } catch {
        return false;
      }
    });
    if (matches.length !== 1) throw new Error(`${location}: expected exactly one oneOf match`);
    return;
  }
  if (Array.isArray(schema.anyOf)) {
    const matched = schema.anyOf.some((candidate) => {
      try {
        assertSchemaValue(candidate as JsonSchema, value, root, location);
        return true;
      } catch {
        return false;
      }
    });
    if (!matched) throw new Error(`${location}: expected an anyOf match`);
    return;
  }

  const allowedTypes = Array.isArray(schema.type)
    ? schema.type
    : typeof schema.type === 'string'
      ? [schema.type]
      : [];
  if (allowedTypes.length) {
    const actualType =
      value === null
        ? 'null'
        : Array.isArray(value)
          ? 'array'
          : Number.isInteger(value)
            ? 'integer'
            : typeof value;
    const numberMatches = allowedTypes.includes('number') && typeof value === 'number';
    if (!allowedTypes.includes(actualType) && !numberMatches) {
      throw new Error(`${location}: expected ${allowedTypes.join('|')}, got ${actualType}`);
    }
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      throw new Error(`${location}: shorter than minLength`);
    }
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength) {
      throw new Error(`${location}: longer than maxLength`);
    }
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value)) {
      throw new Error(`${location}: does not match pattern`);
    }
    if (schema.format === 'date-time' && Number.isNaN(Date.parse(value))) {
      throw new Error(`${location}: invalid date-time`);
    }
  }
  if (typeof value === 'number' && typeof schema.minimum === 'number' && value < schema.minimum) {
    throw new Error(`${location}: smaller than minimum`);
  }
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      throw new Error(`${location}: fewer than minItems`);
    }
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems) {
      throw new Error(`${location}: more than maxItems`);
    }
    if (schema.items) {
      value.forEach((item, index) =>
        assertSchemaValue(schema.items as JsonSchema, item, root, `${location}[${index}]`),
      );
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    for (const key of (schema.required as string[] | undefined) || []) {
      if (!(key in record)) throw new Error(`${location}: missing required property ${key}`);
    }
    const properties = (schema.properties || {}) as Record<string, JsonSchema>;
    for (const [key, item] of Object.entries(record)) {
      if (properties[key] !== undefined) {
        assertSchemaValue(properties[key], item, root, `${location}.${key}`);
      } else if (schema.additionalProperties === false) {
        throw new Error(`${location}: unexpected property ${key}`);
      } else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        assertSchemaValue(schema.additionalProperties as JsonSchema, item, root, `${location}.${key}`);
      }
    }
  }
}

function assertValid(name: string, value: unknown): void {
  const schema = readSchema(name);
  assertSchemaValue(schema, value, schema);
}

describe('published machine-readable schemas', () => {
  it('all schemas are draft 2020-12 documents with resolvable local refs', () => {
    const files = fs.readdirSync(schemasRoot).filter((file) => file.endsWith('.schema.json'));
    expect(files.sort()).toEqual([
      'batch-config.schema.json',
      'batch-progress.schema.json',
      'batch-report.schema.json',
      'freelog-manifest.schema.json',
      'json-envelope.schema.json',
    ]);
    for (const file of files) {
      const schema = readSchema(file);
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema.$id).toMatch(/^urn:freelog:cli:schema:[a-z-]+:v1$/);
      const refs = JSON.stringify(schema).match(/#\/[^"\\]+/g) || [];
      refs.forEach((ref) => expect(() => resolvePointer(schema, ref)).not.toThrow());
    }
  });

  it('validates canonical manifest, batch config, report, envelope, and NDJSON output', () => {
    assertValid('freelog-manifest.schema.json', {
      schemaVersion: 1,
      subject: 'resource',
      identity: { name: 'photo' },
      resource: { typeCode: 'RT005001', title: 'Photo', intro: '', tags: [], coverImages: [] },
      version: { version: '1.0.0', filePath: 'photo.png', artifactMode: 'file' },
      collection: null,
    });

    const configInput = {
      defaults: {
        resourceTypeCode: 'RT005001',
        policies: { policyName: 'free', policyText: 'FOR PUBLIC\nterminate', status: 1 },
      },
      items: [{ filePath: 'photo.png', resourceTitle: 'Photo' }],
    };
    assertValid('batch-config.schema.json', configInput);
    expect(parseBatchConfig(configInput).items).toHaveLength(1);
    const tooManyTags = {
      items: [{ filePath: 'photo.png', tags: Array.from({ length: 21 }, (_, index) => `t${index}`) }],
    };
    expect(() => assertValid('batch-config.schema.json', tooManyTags)).toThrow(/maxItems/);
    expect(() => parseBatchConfig(tooManyTags)).toThrow();

    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'freelog-schema-report-'));
    try {
      const report = createBatchReport({
        parent,
        configFingerprintSource: configInput,
        prepared: [
          {
            absolutePath: path.join(parent, 'photo.png'),
            filename: 'photo.png',
            sha1: 'abc',
            name: 'photo',
            resourceTitle: 'Photo',
            resourceTypeCode: 'RT005001',
            safeDir: 'photo',
            version: '1.0.0',
            description: '',
          },
        ],
      });
      assertValid('batch-report.schema.json', JSON.parse(JSON.stringify(report)));
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }

    setCliEnv('dev');
    assertValid(
      'json-envelope.schema.json',
      JSON.parse(JSON.stringify(formatJsonSuccess('status', { loggedIn: false }))),
    );
    assertValid(
      'json-envelope.schema.json',
      JSON.parse(JSON.stringify(formatJsonFailure('publish', new Error('failed')))),
    );
    assertValid(
      'batch-progress.schema.json',
      JSON.parse(formatBatchProgressLine({ event: 'done', ok: 1, fail: 0, total: 1 })),
    );
  });

  it('keeps real verification passwords out of command argv', () => {
    const previousName = process.env.FREELOG_TEST_LOGIN_NAME;
    const previousPassword = process.env.FREELOG_TEST_PASSWORD;
    process.env.FREELOG_TEST_LOGIN_NAME = 'schema-test-user';
    process.env.FREELOG_TEST_PASSWORD = 'secret with spaces & shell chars';
    try {
      const invocation = verificationLoginInvocation('primary');
      expect(invocation.args).toContain('--password-stdin');
      expect(invocation.args).not.toContain(process.env.FREELOG_TEST_PASSWORD);
      expect(invocation.args).not.toContain('--password');
      expect(invocation.input).toBe(`${process.env.FREELOG_TEST_PASSWORD}\n`);
    } finally {
      if (previousName === undefined) delete process.env.FREELOG_TEST_LOGIN_NAME;
      else process.env.FREELOG_TEST_LOGIN_NAME = previousName;
      if (previousPassword === undefined) delete process.env.FREELOG_TEST_PASSWORD;
      else process.env.FREELOG_TEST_PASSWORD = previousPassword;
    }
  });
});
