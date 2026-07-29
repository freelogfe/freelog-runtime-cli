import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { CliError } from '../core/errors.js';

const TemplateRef = z.object({
  npmName: z.string().min(1),
  version: z.string().regex(/^0\.(4|5)\.\d+/),
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
  version: z.string().regex(/^0\.(4|5)\.\d+/),
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
  throw new CliError('找不到 template-compat.json', {
    code: 1,
    hint: '确认 packages/cli/compat/template-compat.json 存在',
  });
}

export function loadCompat(): TemplateCompat {
  const raw = JSON.parse(fs.readFileSync(compatPath(), 'utf8'));
  const parsed = CompatSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CliError('template-compat.json 校验失败', {
      code: 4,
      details: parsed.error.flatten(),
    });
  }
  validateRuntimePrefix(parsed.data);
  return parsed.data;
}

function validateRuntimePrefix(compat: TemplateCompat): void {
  for (const [runtime, block] of Object.entries(compat.runtimes)) {
    const expected = `${runtime}.`;
    for (const [id, ref] of Object.entries(block.templates)) {
      if (!ref.version.startsWith(expected)) {
        throw new CliError(
          `compat 档 ${runtime} 的模板 ${id} 版本 ${ref.version} 必须以 ${expected} 开头`,
          { code: 4 },
        );
      }
    }
  }
}

export function resolveTemplateRef(
  compat: TemplateCompat,
  opts: { scaffold: 'runtime' | 'package'; runtime?: '0.4' | '0.5'; templateId: string },
): TemplateRefInfo {
  if (opts.scaffold === 'package') {
    const ref = compat.noRuntime?.templates[opts.templateId];
    if (!ref) {
      throw new CliError(`未知前端库模板: ${opts.templateId}`, { code: 4 });
    }
    return { id: opts.templateId, ...ref };
  }
  const runtime = opts.runtime ?? compat.defaultRuntime;
  const block = compat.runtimes[runtime];
  if (!block) {
    throw new CliError(`当前 CLI 不支持运行时档 ${runtime}`, {
      code: 4,
      hint: runtime === '0.4' ? '本仓主推 0.5；0.4 模板线未维护' : undefined,
    });
  }
  const ref = block.templates[opts.templateId];
  if (!ref) {
    throw new CliError(`运行时 ${runtime} 下无模板 ${opts.templateId}`, { code: 4 });
  }
  return { id: opts.templateId, ...ref, freelogRuntimeRange: block.freelogRuntimeRange };
}

export function loadManifest(manifestPath: string): TemplateManifest {
  if (!fs.existsSync(manifestPath)) {
    throw new CliError(`缺少 template.manifest.json: ${manifestPath}`, { code: 4 });
  }
  let rawText = fs.readFileSync(manifestPath, 'utf8');
  if (rawText.charCodeAt(0) === 0xfeff) rawText = rawText.slice(1);
  const parsed = ManifestSchema.safeParse(JSON.parse(rawText));
  if (!parsed.success) {
    throw new CliError('template.manifest.json 校验失败', {
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
    throw new CliError(`manifest.id (${manifest.id}) 与模板 id (${ref.id}) 不一致`, { code: 4 });
  }
  if (manifest.npmName !== ref.npmName || manifest.version !== ref.version) {
    throw new CliError(
      `manifest 与 compat 不一致: ${manifest.npmName}@${manifest.version} vs ${ref.npmName}@${ref.version}`,
      { code: 4 },
    );
  }
  if (runtime) {
    const versions = manifest.runtimeVersions || [];
    if (!versions.includes(runtime)) {
      throw new CliError(`本地模板 ${manifest.id} 不支持 runtime ${runtime}`, { code: 4 });
    }
  }
}
