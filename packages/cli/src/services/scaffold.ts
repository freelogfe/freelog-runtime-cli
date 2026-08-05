import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { CliError } from '../core/errors.js';
import {
  createCollectionManifestTemplate,
  createResourceManifestTemplate,
  createVersionManifestTemplate,
  ensureProjectGitignore,
  writeCollectionProject,
  writeResourceProject,
  writeVersionProject,
} from '../config/project.js';
import {
  assertManifestMatchesRef,
  loadCompat,
  loadManifest,
  resolveTemplateRef,
  type TemplateCompat,
  type TemplateManifest,
  type TemplateRefInfo,
} from './compat.js';

export interface InitScaffoldOptions {
  dir: string;
  cwd: string;
  scaffold: 'runtime' | 'package' | 'none' | 'collection';
  template?: string;
  resourceTypeCode?: string;
  runtime?: '0.4' | '0.5';
  resourceName?: string;
  title?: string;
  namespace?: string;
  templatesDir?: string;
  version?: string;
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
    throw new CliError('项目目录名不能为空', { code: 4 });
  }
  const projectDir = rawDir === '.' ? path.resolve(opts.cwd) : path.resolve(opts.cwd, rawDir);
  const projectName = formatName(path.basename(projectDir));
  if (!/^[a-z0-9_-]+$/.test(projectName)) {
    throw new CliError('项目名称只能包含英文、数字、下划线和横杠', { code: 4 });
  }

  const resourceName = formatName(opts.resourceName || projectName);
  if (!/^[a-z0-9_-]+$/.test(resourceName)) {
    throw new CliError('资源短授权标识只能包含英文、数字、下划线和横杠', { code: 4 });
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
      throw new CliError(`目录已初始化: ${projectDir}`, {
        code: 4,
        hint: '确认要重写 freelog.manifest.json/.freelog/state.json 时传 --yes',
      });
    }
    if (await hasBoundResource(manifest, state)) {
      throw new CliError(`目录已绑定平台资源，拒绝 init 覆盖: ${projectDir}`, {
        code: 4,
        hint: '需要重新绑定时请先人工备份并移走 freelog.manifest.json 与 .freelog/state.json',
      });
    }
    return;
  }

  if (scaffold === 'runtime' || scaffold === 'package') {
    const entries = await fs.readdir(projectDir);
    if (entries.length) {
      throw new CliError(`目录非空，不能复制模板: ${projectDir}`, {
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
    path.resolve(here, '../../../templates'),
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
      else reject(new CliError(`${pm} install 失败 (exit ${code})`, { code: 1 }));
    });
  });
}

async function resolveTemplateSource(
  ref: TemplateRefInfo,
  opts: { templatesDir?: string; runtime?: '0.4' | '0.5'; scaffold: 'runtime' | 'package' },
): Promise<{ source: string; manifest: TemplateManifest }> {
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
    return { source: templateDir, manifest };
  }

  // npm 精确版本缓存
  const cacheRoot = templateCacheDir(ref.npmName, ref.version);
  const cachedTemplate = path.join(cacheRoot, 'package', 'template');
  const cachedManifest = path.join(cacheRoot, 'package', 'template.manifest.json');
  if (!(await fs.pathExists(cachedTemplate))) {
    await fs.ensureDir(cacheRoot);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'npm',
        ['pack', `${ref.npmName}@${ref.version}`, '--pack-destination', cacheRoot],
        { stdio: 'inherit', shell: process.platform === 'win32' },
      );
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new CliError(`npm pack ${ref.npmName}@${ref.version} 失败`, { code: 1 }));
      });
    });
    const tgz = (await fs.readdir(cacheRoot)).find((f) => f.endsWith('.tgz'));
    if (!tgz) {
      throw new CliError(`npm pack 未产出 tarball: ${ref.npmName}@${ref.version}`, { code: 1 });
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn('tar', ['-xzf', tgz, '-C', cacheRoot], {
        cwd: cacheRoot,
        shell: process.platform === 'win32',
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new CliError('解压模板 tarball 失败', { code: 1 }));
      });
    });
  }

  if (!(await fs.pathExists(cachedTemplate))) {
    throw new CliError(`未能获取模板 ${ref.npmName}@${ref.version}`, {
      code: 4,
      hint: '开发时传 --templates-dir <repo>/packages/templates，或确认 npm 包已发布',
    });
  }

  const manifest = await fs.pathExists(cachedManifest)
    ? loadManifest(cachedManifest)
    : ({
        id: ref.id,
        npmName: ref.npmName,
        title: ref.id,
        tags: opts.scaffold === 'runtime' ? ['runtime'] : ['package'],
        version: ref.version,
        runtimeVersions: opts.runtime ? [opts.runtime] : undefined,
        ejsIgnore: ['**/public/**', '**/node_modules/**'],
      } satisfies TemplateManifest);

  if (await fs.pathExists(cachedManifest)) {
    assertManifestMatchesRef(manifest, ref, opts.scaffold === 'runtime' ? opts.runtime : undefined);
  }

  return { source: cachedTemplate, manifest };
}

export async function runInitScaffold(opts: InitScaffoldOptions): Promise<{
  projectDir: string;
  compat?: TemplateCompat;
}> {
  const { projectDir, projectName, resourceName, resourceTitle } = resolveInitTarget(opts);
  await assertCanInitializeProject(projectDir, opts.scaffold, Boolean(opts.overwrite));

  const version = opts.version || '1.0.0';

  if (!opts.resourceTypeCode?.trim()) {
    throw new CliError('init 必须提供 --resource-type <resourceTypeCode>', {
      code: 4,
      hint: '类型是资源创建契约的一部分；例如 freelog-cli init my-theme --scaffold runtime --template vite-vue-ts --resource-type <code> --yes',
    });
  }

  if (opts.scaffold === 'none' || opts.scaffold === 'collection') {
    await fs.ensureDir(projectDir);
    if (opts.scaffold === 'collection') {
      writeCollectionProject(
        createCollectionManifestTemplate({
          resourceName,
          resourceTypeCode: opts.resourceTypeCode || '',
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
          resourceTitle,
        }),
        projectDir,
      );
      writeVersionProject(
        createVersionManifestTemplate({
          resourceName,
          resourceTypeCode: opts.resourceTypeCode || '',
          version,
          filePath: 'dist',
          runtimeVersion: opts.runtime,
        }),
        projectDir,
      );
    }
    ensureProjectGitignore(projectDir);
    return { projectDir };
  }

  if (!opts.template) {
    throw new CliError('缺少 --template', { code: 4 });
  }
  if (opts.scaffold === 'package' && !opts.namespace) {
    throw new CliError('前端库脚手架需要 --namespace', { code: 4 });
  }

  const compat = loadCompat();
  const runtime = opts.runtime ?? compat.defaultRuntime;
  if (opts.scaffold === 'runtime' && runtime === '0.4' && !compat.runtimes['0.4']) {
    throw new CliError('当前 CLI 不支持运行时档 0.4', {
      code: 4,
      hint: '本仓主推 0.5；请使用 --runtime 0.5',
    });
  }

  const ref = resolveTemplateRef(compat, {
    scaffold: opts.scaffold,
    runtime: opts.scaffold === 'runtime' ? runtime : undefined,
    templateId: opts.template,
  });

  const { source, manifest } = await resolveTemplateSource(ref, {
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
      resourceTitle,
    }),
    projectDir,
  );

  writeVersionProject(
    createVersionManifestTemplate({
      resourceName,
      resourceTypeCode: opts.resourceTypeCode || '',
      version,
      filePath: manifest.filePath || 'dist',
      runtimeVersion: opts.scaffold === 'runtime' ? runtime : undefined,
    }),
    projectDir,
  );

  ensureProjectGitignore(projectDir);

  if (!opts.skipInstall) {
    const pm = opts.pm || 'pnpm';
    await runPmInstall(pm, projectDir);
  }

  return { projectDir, compat };
}
