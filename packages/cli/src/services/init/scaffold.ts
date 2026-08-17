import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import ejs from 'ejs';
import semver from 'semver';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  createCollectionManifestTemplate,
  createResourceManifestTemplate,
  createVersionManifestTemplate,
  ensureProjectGitignore,
  writeCollectionProject,
  writeResourceProject,
  writeVersionProject,
} from '../../config/project.js';
import {
  assertManifestMatchesRef,
  loadCompat,
  loadManifest,
  resolveTemplateRef,
  type TemplateCompat,
  type TemplateManifest,
  type TemplateRefInfo,
} from '../compat.js';

export interface InitScaffoldOptions {
  dir: string;
  cwd: string;
  scaffold: 'runtime' | 'package' | 'none' | 'collection';
  template?: string;
  resourceTypeCode?: string;
  resourceTypeName?: string;
  resourceTypeLabels?: string[];
  runtime?: '0.4' | '0.5';
  resourceName?: string;
  title?: string;
  namespace?: string;
  templatesDir?: string;
  version?: string;
  versionFilePath?: string;
  artifactMode?: 'file' | 'directory-zip';
  pm?: 'pnpm' | 'npm' | 'yarn';
  skipInstall?: boolean;
  overwrite?: boolean;
}

function formatName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

function resolveInitTarget(opts: InitScaffoldOptions): {
  projectDir: string;
  projectName: string;
  resourceName: string;
  resourceTitle: string;
} {
  const rawDir = opts.dir.trim();
  if (!rawDir) {
    throw cliError(I18N_KEYS.project_dir_name_empty, { code: 4 });
  }
  const projectDir = rawDir === '.' ? path.resolve(opts.cwd) : path.resolve(opts.cwd, rawDir);
  const projectName = formatName(path.basename(projectDir));
  if (!/^[a-z0-9_-]+$/.test(projectName)) {
    throw cliError(I18N_KEYS.project_name_invalid_chars, { code: 4 });
  }

  const resourceName = formatName(opts.resourceName || projectName);
  if (!/^[a-z0-9_-]+$/.test(resourceName)) {
    throw cliError(I18N_KEYS.auth_id_invalid_chars, { code: 4 });
  }

  return {
    projectDir,
    projectName,
    resourceName,
    resourceTitle: opts.title?.trim() || resourceName,
  };
}

async function assertCanInitializeProject(
  projectDir: string,
  scaffold: InitScaffoldOptions['scaffold'],
  overwrite: boolean,
): Promise<void> {
  const exists = await fs.pathExists(projectDir);
  if (!exists) return;

  const manifest = path.join(projectDir, 'freelog.manifest.json');
  const state = path.join(projectDir, '.freelog', 'state.json');
  if ((await fs.pathExists(manifest)) || (await fs.pathExists(state))) {
    if (!overwrite) {
      throw cliError(I18N_KEYS.dir_already_initialized, {
        code: 4,
        hint: '确认要重写 freelog.manifest.json/.freelog/state.json 时传 --yes',
      });
    }
    if (await hasBoundResource(manifest, state)) {
      throw cliError(I18N_KEYS.dir_bound_refuse_init, {
        code: 4,
        hint: '需要重新绑定时请先人工备份并移走 freelog.manifest.json 与 .freelog/state.json',
      });
    }
    return;
  }

  if (scaffold === 'runtime' || scaffold === 'package') {
    const entries = await fs.readdir(projectDir);
    if (entries.length) {
      throw cliError(I18N_KEYS.dir_not_empty_cannot_copy_template, {
        code: 4,
        hint: '已有主题/插件项目请在目录内执行 init . --scaffold none --runtime 0.5',
      });
    }
  }
}

async function hasBoundResource(manifestPath: string, statePath: string): Promise<boolean> {
  for (const file of [manifestPath, statePath]) {
    if (!(await fs.pathExists(file))) continue;
    try {
      const raw = await fs.readJson(file);
      const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
      const resource = record.resource as Record<string, unknown> | undefined;
      const collection = record.collection as Record<string, unknown> | undefined;
      if (record.resourceId || resource?.resourceId || collection?.resourceId) return true;
    } catch {
      continue;
    }
  }
  return false;
}

function matchIgnore(relPosix: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (pattern === '**/public/**' && (relPosix.startsWith('public/') || relPosix.includes('/public/'))) {
      return true;
    }
    if (
      pattern === '**/node_modules/**' &&
      (relPosix.startsWith('node_modules/') || relPosix.includes('/node_modules/'))
    ) {
      return true;
    }
    if (pattern === relPosix || pattern === `**/${relPosix}`) return true;
  }
  return false;
}

async function renderEjsTree(
  root: string,
  data: Record<string, unknown>,
  ejsIgnore: string[] = [],
): Promise<void> {
  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (matchIgnore(`${rel}/`, ejsIgnore) || entry.name === 'node_modules') continue;
        await walk(full);
        continue;
      }
      if (matchIgnore(rel, ejsIgnore)) continue;
      if (!/\.(json|js|ts|tsx|jsx|vue|html|md|mjs|cjs)$/.test(entry.name)) continue;
      const content = await fs.readFile(full, 'utf8');
      if (!content.includes('<%')) continue;
      await fs.writeFile(full, ejs.render(content, data), 'utf8');
    }
  };
  await walk(root);
}

function defaultTemplatesDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // 源码：packages/cli/src/services → packages/templates
    path.resolve(here, '../../../../templates'),
    // 打包：packages/cli/dist → packages/templates
    path.resolve(here, '../../templates'),
    // 打包：packages/cli/dist/bin → packages/templates
    path.resolve(here, '../../../templates'),
    path.resolve(process.cwd(), 'packages/templates'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

function templateCacheDir(npmName: string, version: string): string {
  return path.join(os.homedir(), '.freelog-cli', 'template', npmName.replace('/', '__'), version);
}

async function resolvePublishedTemplateRef(ref: TemplateRefInfo): Promise<TemplateRefInfo> {
  if (ref.version !== 'latest') return ref;

  const spec = `${ref.npmName}@latest`;
  const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn('npm', ['view', spec, 'version', '--json'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else {
        reject(
          cliError(I18N_KEYS.template_fetch_failed, {
            code: 4,
            params: { name: ref.npmName, version: ref.version },
            details: { spec, stderr: stderr.trim(), exitCode: code },
          }),
        );
      }
    });
  });

  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch (error) {
    throw cliError(I18N_KEYS.template_fetch_failed, {
      code: 4,
      params: { name: ref.npmName, version: ref.version },
      details: { spec, stdout: stdout.trim(), stderr: stderr.trim() },
      cause: error,
    });
  }
  const candidate = Array.isArray(value) ? value.at(-1) : value;
  if (typeof candidate !== 'string' || !semver.valid(candidate)) {
    throw cliError(I18N_KEYS.template_fetch_failed, {
      code: 4,
      params: { name: ref.npmName, version: ref.version },
      details: { spec, resolvedVersion: candidate },
    });
  }
  return { ...ref, version: candidate };
}

async function runPmInstall(pm: 'pnpm' | 'npm' | 'yarn', cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(pm, ['install'], {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(cliError(I18N_KEYS.pm_install_failed, { code: 1, params: { pm, code: code ?? -1 } }));
    });
  });
}

async function resolveTemplateSource(
  ref: TemplateRefInfo,
  opts: { templatesDir?: string; runtime?: '0.4' | '0.5'; scaffold: 'runtime' | 'package' },
): Promise<{ source: string; manifest: TemplateManifest; ref: TemplateRefInfo }> {
  const roots: string[] = [];
  if (opts.templatesDir) roots.push(path.resolve(opts.templatesDir));
  if (process.env.FREELOG_TEMPLATES_DIR) {
    roots.push(path.resolve(process.env.FREELOG_TEMPLATES_DIR));
  }
  roots.push(defaultTemplatesDir());

  for (const root of roots) {
    const templateDir = path.join(root, ref.id, 'template');
    const manifestPath = path.join(root, ref.id, 'template.manifest.json');
    if (!(await fs.pathExists(templateDir))) continue;
    const manifest = loadManifest(manifestPath);
    assertManifestMatchesRef(manifest, ref, opts.scaffold === 'runtime' ? opts.runtime : undefined);
    return { source: templateDir, manifest, ref: { ...ref, version: manifest.version } };
  }

  const resolvedRef = await resolvePublishedTemplateRef(ref);
  // latest 只用于选择版本；缓存、下载和校验始终使用解析后的精确版本。
  const cacheRoot = templateCacheDir(resolvedRef.npmName, resolvedRef.version);
  const cachedTemplate = path.join(cacheRoot, 'package', 'template');
  const cachedManifest = path.join(cacheRoot, 'package', 'template.manifest.json');
  if (!(await fs.pathExists(cachedTemplate))) {
    const tempRoot = `${cacheRoot}.tmp-${randomUUID()}`;
    await fs.ensureDir(tempRoot);
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          'npm',
          ['pack', `${resolvedRef.npmName}@${resolvedRef.version}`, '--pack-destination', tempRoot],
          { stdio: 'inherit', shell: process.platform === 'win32' },
        );
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(cliError(I18N_KEYS.npm_pack_failed, { code: 1, params: { name: resolvedRef.npmName, version: resolvedRef.version } }));
        });
      });
      const tgz = (await fs.readdir(tempRoot)).find((file) => file.endsWith('.tgz'));
      if (!tgz) throw cliError(I18N_KEYS.npm_pack_no_tarball, { code: 1 });
      await new Promise<void>((resolve, reject) => {
        const child = spawn('tar', ['-xzf', tgz, '-C', tempRoot], {
          cwd: tempRoot,
          shell: process.platform === 'win32',
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code === 0) resolve();
          else reject(cliError(I18N_KEYS.template_tarball_extract_failed, { code: 1 }));
        });
      });

      const tempTemplate = path.join(tempRoot, 'package', 'template');
      const tempManifest = path.join(tempRoot, 'package', 'template.manifest.json');
      if (!(await fs.pathExists(tempTemplate))) {
        throw cliError(I18N_KEYS.template_fetch_failed, { code: 4 });
      }
      const manifest = loadManifest(tempManifest);
      assertManifestMatchesRef(manifest, resolvedRef, opts.scaffold === 'runtime' ? opts.runtime : undefined);

      await fs.ensureDir(path.dirname(cacheRoot));
      if (await fs.pathExists(cacheRoot)) {
        try {
          const existingManifest = loadManifest(cachedManifest);
          if (await fs.pathExists(cachedTemplate)) {
            assertManifestMatchesRef(
              existingManifest,
              resolvedRef,
              opts.scaffold === 'runtime' ? opts.runtime : undefined,
            );
            return { source: cachedTemplate, manifest: existingManifest, ref: resolvedRef };
          }
        } catch {
          // 缓存不完整或契约不匹配时，使用本次已校验的临时目录替换。
        }
        await fs.remove(cacheRoot);
      }
      try {
        await fs.rename(tempRoot, cacheRoot);
      } catch (error) {
        // 两个首次 init 可能同时完成下载；采用已经原子落盘且契约有效的赢家缓存。
        if (await fs.pathExists(cachedTemplate)) {
          const winnerManifest = loadManifest(cachedManifest);
          assertManifestMatchesRef(
            winnerManifest,
            resolvedRef,
            opts.scaffold === 'runtime' ? opts.runtime : undefined,
          );
          return { source: cachedTemplate, manifest: winnerManifest, ref: resolvedRef };
        }
        throw error;
      }
    } finally {
      if (await fs.pathExists(tempRoot)) await fs.remove(tempRoot);
    }
  }

  if (!(await fs.pathExists(cachedTemplate))) {
    throw cliError(I18N_KEYS.template_fetch_failed, {
      code: 4,
      hint: '开发时传 --templates-dir <repo>/packages/templates，或确认 npm 包已发布',
    });
  }

  const manifest = loadManifest(cachedManifest);
  assertManifestMatchesRef(manifest, resolvedRef, opts.scaffold === 'runtime' ? opts.runtime : undefined);

  return { source: cachedTemplate, manifest, ref: resolvedRef };
}

export async function runInitScaffold(opts: InitScaffoldOptions): Promise<{
  projectDir: string;
  compat?: TemplateCompat;
  template?: TemplateRefInfo;
}> {
  const { projectDir, projectName, resourceName, resourceTitle } = resolveInitTarget(opts);
  await assertCanInitializeProject(projectDir, opts.scaffold, Boolean(opts.overwrite));

  const version = opts.version || '1.0.0';
  const filePath =
    opts.versionFilePath !== undefined
      ? opts.versionFilePath
      : opts.scaffold === 'runtime' || opts.scaffold === 'package'
        ? 'dist'
        : '';

  if (!opts.resourceTypeCode?.trim()) {
    throw cliError(I18N_KEYS.init_resource_type_required, {
      code: 4,
      hint: '交互终端可省略 --resource-type（会一级级选择）；或 freelog-cli type pick；脚本模式必须显式传 --resource-type',
    });
  }

  if (opts.scaffold === 'none' || opts.scaffold === 'collection') {
    await fs.ensureDir(projectDir);
    if (opts.scaffold === 'collection') {
      writeCollectionProject(
        createCollectionManifestTemplate({
          resourceName,
          resourceTypeCode: opts.resourceTypeCode || '',
          resourceTypeName: opts.resourceTypeName,
          resourceTitle,
          version,
        }),
        projectDir,
      );
    } else {
      writeResourceProject(
        createResourceManifestTemplate({
          resourceName,
          resourceTypeCode: opts.resourceTypeCode || '',
          resourceTypeName: opts.resourceTypeName,
          resourceTypeLabels: opts.resourceTypeLabels,
          resourceTitle,
        }),
        projectDir,
      );
      writeVersionProject(
        createVersionManifestTemplate({
          resourceName,
          resourceTypeCode: opts.resourceTypeCode || '',
          version,
          filePath: filePath || 'dist',
          artifactMode: opts.artifactMode,
          runtimeVersion: opts.runtime,
        }),
        projectDir,
      );
    }
    ensureProjectGitignore(projectDir);
    return { projectDir };
  }

  if (!opts.template) {
    throw cliError(I18N_KEYS.missing_template_flag, { code: 4 });
  }
  if (opts.scaffold === 'package' && !opts.namespace) {
    throw cliError(I18N_KEYS.frontend_scaffold_needs_namespace, { code: 4 });
  }

  const compat = loadCompat();
  const runtime = opts.runtime ?? compat.defaultRuntime;
  if (opts.scaffold === 'runtime' && runtime === '0.4' && !compat.runtimes['0.4']) {
    throw cliError(I18N_KEYS.runtime_04_not_supported, {
      code: 4,
      hint: '本仓主推 0.5；请使用 --runtime 0.5',
    });
  }

  const ref = resolveTemplateRef(compat, {
    scaffold: opts.scaffold,
    runtime: opts.scaffold === 'runtime' ? runtime : undefined,
    templateId: opts.template,
  });

  const { source, manifest, ref: resolvedTemplate } = await resolveTemplateSource(ref, {
    templatesDir: opts.templatesDir,
    runtime: opts.scaffold === 'runtime' ? runtime : undefined,
    scaffold: opts.scaffold,
  });

  await fs.copy(source, projectDir);
  await renderEjsTree(
    projectDir,
    {
      name: projectName,
      projectName,
      className: projectName.replace(/(^|[-_])(\w)/g, (_, __, c: string) => c.toUpperCase()),
      version,
      nameSpace: opts.namespace,
      initType: opts.scaffold,
      runtimeVersion: runtime,
    },
    manifest.ejsIgnore || ['**/public/**', '**/node_modules/**'],
  );

  writeResourceProject(
    createResourceManifestTemplate({
      resourceName,
      resourceTypeCode: opts.resourceTypeCode || '',
      resourceTypeName: opts.resourceTypeName,
      resourceTypeLabels: opts.resourceTypeLabels,
      resourceTitle,
    }),
    projectDir,
  );

  writeVersionProject(
    createVersionManifestTemplate({
      resourceName,
      resourceTypeCode: opts.resourceTypeCode || '',
      version,
      filePath: manifest.filePath || filePath || 'dist',
      artifactMode: 'directory-zip',
      runtimeVersion: opts.scaffold === 'runtime' ? runtime : undefined,
    }),
    projectDir,
  );

  ensureProjectGitignore(projectDir);

  if (!opts.skipInstall) {
    const pm = opts.pm || 'pnpm';
    await runPmInstall(pm, projectDir);
  }

  return { projectDir, compat, template: resolvedTemplate };
}
