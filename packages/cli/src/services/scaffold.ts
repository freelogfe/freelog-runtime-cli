import { spawn } from 'node:child_process';
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import { CliError } from '../core/errors.js';
import {
  writeCollectionConfig,
  writeResourceConfig,
  writeVersionConfig,
} from '../config/writeShell.js';
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
  name: string;
  cwd: string;
  scaffold: 'runtime' | 'package' | 'none' | 'collection';
  template?: string;
  resourceTypeCode?: string;
  runtime?: '0.4' | '0.5';
  namespace?: string;
  templatesDir?: string;
  version?: string;
  pm?: 'pnpm' | 'npm' | 'yarn';
  skipInstall?: boolean;
}

function formatName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
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
  const projectName = formatName(opts.name);
  if (!/^[a-z0-9_-]+$/.test(projectName)) {
    throw new CliError('项目名称只能包含英文、数字、下划线和横杠', { code: 4 });
  }

  const projectDir = path.join(opts.cwd, projectName);
  if (await fs.pathExists(projectDir)) {
    throw new CliError(`目录已存在: ${projectDir}`, { code: 4, hint: '换名或删除后重试' });
  }

  const version = opts.version || '1.0.0';

  if (opts.scaffold === 'runtime' || opts.scaffold === 'package') {
    if (!opts.resourceTypeCode) {
      throw new CliError('--scaffold runtime|package 时必须提供 --resource-type', {
        code: 4,
        hint: 'freelog-cli init <name> --scaffold runtime --template vite-vue-ts --resource-type <code> --yes',
      });
    }
  }

  if (opts.scaffold === 'none' || opts.scaffold === 'collection') {
    await fs.ensureDir(projectDir);
    if (opts.scaffold === 'collection') {
      writeCollectionConfig(
        {
          resourceId: '',
          resourceName: projectName,
          resourceType: [],
          resourceTypeCode: opts.resourceTypeCode || '',
          resourceTitle: projectName,
        },
        projectDir,
      );
    } else {
      writeResourceConfig(
        {
          resourceId: '',
          resourceName: projectName,
          resourceType: [],
          resourceTypeCode: opts.resourceTypeCode || '',
          resourceTitle: projectName,
        },
        projectDir,
      );
      writeVersionConfig(
        {
          resourceId: '',
          resourceName: projectName,
          version,
          filePath: 'dist',
        },
        projectDir,
      );
    }
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

  writeResourceConfig(
    {
      resourceId: '',
      resourceName: projectName,
      resourceType: [],
      resourceTypeCode: opts.resourceTypeCode || '',
      resourceTitle: projectName,
    },
    projectDir,
  );

  writeVersionConfig(
    {
      resourceId: '',
      resourceName: projectName,
      version,
      filePath: manifest.filePath || 'dist',
      runtimeVersion: opts.scaffold === 'runtime' ? runtime : undefined,
    },
    projectDir,
  );

  await fs.ensureDir(path.join(projectDir, '.freelog'));
  await fs.writeJson(
    path.join(projectDir, '.freelog', 'scaffold-meta.json'),
    {
      cliVersion: compat.cliVersion,
      templateId: opts.template,
      templateVersion: ref.version,
      npmName: ref.npmName,
      runtimeVersion: opts.scaffold === 'runtime' ? runtime : null,
      freelogRuntimeRange: ref.freelogRuntimeRange ?? null,
      scaffold: opts.scaffold,
    },
    { spaces: 2 },
  );

  if (!opts.skipInstall) {
    const pm = opts.pm || 'pnpm';
    await runPmInstall(pm, projectDir);
  }

  return { projectDir, compat };
}
