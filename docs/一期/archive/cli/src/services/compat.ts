import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import semver from 'semver';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

const TemplateVersion = z.string().refine((value) => Boolean(semver.valid(value)), {
  message: 'template version must be valid SemVer',
});

const TemplateRef = z.object({
  npmName: z.string().min(1),
  version: z.union([z.literal('latest'), TemplateVersion]),
});

const CompatSchema = z.object({
  schemaVersion: z.literal(1),
  cliVersion: z.string().regex(/^0\.(4|5)\.\d+/),
  defaultRuntime: z.enum(['0.4', '0.5']),
  runtimes: z.record(
    z.string(),
    z.object({
      freelogRuntimeRange: z.string(),
      templates: z.record(z.string(), TemplateRef),
    }),
  ),
  noRuntime: z
    .object({
      templates: z.record(z.string(), TemplateRef),
    })
    .optional(),
});

export const ManifestSchema = z.object({
  id: z.string().min(1),
  npmName: z.string().min(1),
  title: z.string().min(1),
  tags: z.array(z.string()),
  version: TemplateVersion,
  runtimeVersions: z.array(z.enum(['0.4', '0.5'])).optional(),
  freelogRuntimeRange: z.string().optional(),
  filePath: z.string().optional(),
  startCommand: z.string().optional(),
  ejsIgnore: z.array(z.string()).optional(),
});

export type TemplateCompat = z.infer<typeof CompatSchema>;
export type TemplateManifest = z.infer<typeof ManifestSchema>;
export type TemplateRefInfo = z.infer<typeof TemplateRef> & {
  id: string;
  freelogRuntimeRange?: string;
};
export type TemplateListItem = {
  id: string;
  scaffold: 'runtime' | 'package';
  runtime?: '0.4' | '0.5';
  npmName: string;
  version: string;
  freelogRuntimeRange?: string;
  defaultRuntime?: boolean;
};

function compatPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // 源码：src/services → ../../compat
    path.resolve(here, '../../compat/template-compat.json'),
    // 打包：dist/*.js → ../compat
    path.resolve(here, '../compat/template-compat.json'),
    path.resolve(here, '../../../compat/template-compat.json'),
    path.resolve(here, 'compat/template-compat.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw cliError(I18N_KEYS.template_compat_not_found, {
    code: 1,
    hint: '确认 packages/cli/compat/template-compat.json 存在',
  });
}

export function loadCompat(): TemplateCompat {
  const raw = JSON.parse(fs.readFileSync(compatPath(), 'utf8'));
  const parsed = CompatSchema.safeParse(raw);
  if (!parsed.success) {
    throw cliError(I18N_KEYS.template_compat_validation_failed, {
      code: 4,
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

export function resolveTemplateRef(
  compat: TemplateCompat,
  opts: { scaffold: 'runtime' | 'package'; runtime?: '0.4' | '0.5'; templateId: string },
): TemplateRefInfo {
  if (opts.scaffold === 'package') {
    const ref = compat.noRuntime?.templates[opts.templateId];
    if (!ref) {
      throw cliError(I18N_KEYS.unknown_frontend_template, { code: 4 });
    }
    return { id: opts.templateId, ...ref };
  }
  const runtime = opts.runtime ?? compat.defaultRuntime;
  const block = compat.runtimes[runtime];
  if (!block) {
    throw cliError(I18N_KEYS.runtime_not_supported, {
      code: 4,
      hint: runtime === '0.4' ? '本仓主推 0.5；0.4 模板线未维护' : undefined,
    });
  }
  const ref = block.templates[opts.templateId];
  if (!ref) {
    throw cliError(I18N_KEYS.no_template_for_runtime, { code: 4 });
  }
  return { id: opts.templateId, ...ref, freelogRuntimeRange: block.freelogRuntimeRange };
}

export function listTemplateRefs(compat: TemplateCompat = loadCompat()): TemplateListItem[] {
  const rows: TemplateListItem[] = [];
  for (const [runtime, block] of Object.entries(compat.runtimes)) {
    for (const [id, ref] of Object.entries(block.templates)) {
      rows.push({
        id,
        scaffold: 'runtime',
        runtime: runtime as '0.4' | '0.5',
        npmName: ref.npmName,
        version: ref.version,
        freelogRuntimeRange: block.freelogRuntimeRange,
        defaultRuntime: runtime === compat.defaultRuntime,
      });
    }
  }
  for (const [id, ref] of Object.entries(compat.noRuntime?.templates || {})) {
    rows.push({
      id,
      scaffold: 'package',
      npmName: ref.npmName,
      version: ref.version,
    });
  }
  return rows.sort((a, b) => {
    const byScaffold = a.scaffold.localeCompare(b.scaffold);
    if (byScaffold !== 0) return byScaffold;
    const byRuntime = String(a.runtime || '').localeCompare(String(b.runtime || ''));
    if (byRuntime !== 0) return byRuntime;
    return a.id.localeCompare(b.id);
  });
}

export function loadManifest(manifestPath: string): TemplateManifest {
  if (!fs.existsSync(manifestPath)) {
    throw cliError(I18N_KEYS.template_manifest_missing, {
      code: 4,
      params: { path: manifestPath },
      details: { manifestPath },
    });
  }
  let rawText = fs.readFileSync(manifestPath, 'utf8');
  if (rawText.charCodeAt(0) === 0xfeff) rawText = rawText.slice(1);
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch (error) {
    throw cliError(I18N_KEYS.template_manifest_validation_failed, {
      code: 4,
      details: {
        manifestPath,
        cause: error instanceof Error ? error.message : String(error),
      },
    });
  }
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw cliError(I18N_KEYS.template_manifest_validation_failed, {
      code: 4,
      details: parsed.error.flatten(),
    });
  }
  return parsed.data;
}

export function assertManifestMatchesRef(
  manifest: TemplateManifest,
  ref: TemplateRefInfo,
  runtime?: '0.4' | '0.5',
): void {
  if (manifest.id !== ref.id) {
    throw cliError(I18N_KEYS.template_manifest_id_mismatch, { code: 4 });
  }
  const versionMatches = ref.version === 'latest' || manifest.version === ref.version;
  if (manifest.npmName !== ref.npmName || !versionMatches) {
    throw cliError(I18N_KEYS.compat_manifest_mismatch, {
      code: 4,
      params: {
        manifestRef: `${manifest.npmName}@${manifest.version}`,
        compatRef: `${ref.npmName}@${ref.version}`,
      },
    });
  }
  if (runtime) {
    const versions = manifest.runtimeVersions || [];
    if (!versions.includes(runtime)) {
      throw cliError(I18N_KEYS.local_template_runtime_unsupported, { code: 4 });
    }
  }
}
