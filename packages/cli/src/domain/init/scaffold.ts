/** 只创建本地单资源工程；全部内容先落 staging，再安全提交到目标。 */

import { execFile as execFileCallback } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { CliError } from '../../core/errors';
import { getTypeInfo, type TypeApis, type TypeNode } from '../create/typePick';
import { createIdentity } from '../../local/identity';
import { repairIndex } from '../../local/indexFile';
import { withInitLock } from '../../local/lock';
import type { IdentityRecord } from '../../local/types';
import { getTemplate, type TemplateItem, type TemplateTarget } from './templates';

const execFile = promisify(execFileCallback);

export type TemplateSource = (input: { template: TemplateItem; targetDir: string }) => Promise<void>;

export type InitProjectInput = {
  cwd: string;
  dir?: string;
  shortcut?: TemplateTarget;
  typeCode?: string;
  template?: string;
  yes?: boolean;
  templateSource?: TemplateSource;
  typeApis?: TypeApis;
  /** 仅测试替身；生产走统一 TypeResolver。 */
  typeValidator?: (code: string) => Promise<TypeNode>;
};

type RemoteManifest = { id?: string; npmName?: string; version?: string; tags?: unknown };

function isFixedTemplateType(typeCode: string): boolean {
  return typeCode === 'RT001' || typeCode === 'RT002';
}

/** 将可选目录参数解析为绝对目标目录。 */
export function resolveTargetDir(input: Pick<InitProjectInput, 'cwd' | 'dir'>): string {
  return input.dir ? (path.isAbsolute(input.dir) ? input.dir : path.resolve(input.cwd, input.dir)) : path.resolve(input.cwd);
}

/**
 * init 前仅允许一个由 login 创建的 `.freelog/auth` 选择器；这让「登录后 init .」
 * 成为可用主路径，同时拒绝合并任何业务文件或既有状态主本。
 */
function targetHasOnlyAuthSelector(targetDir: string): boolean {
  if (!existsSync(targetDir)) return false;
  let entries: string[];
  try { entries = readdirSync(targetDir); } catch {
    throw new CliError('目标目录不可读取，拒绝覆盖', 'INIT_TARGET_NOT_EMPTY');
  }
  if (entries.length === 0) return false;
  if (entries.length !== 1 || entries[0] !== '.freelog') return false;
  const stateDir = path.join(targetDir, '.freelog');
  if (!lstatSync(stateDir).isDirectory() || lstatSync(stateDir).isSymbolicLink()) return false;
  const stateEntries = readdirSync(stateDir);
  if (stateEntries.length !== 1 || stateEntries[0] !== 'auth') return false;
  const auth = lstatSync(path.join(stateDir, 'auth'));
  return auth.isFile() && !auth.isSymbolicLink();
}

/** 返回目标是否已存在，以及是否应在提交时保留既有认证选择器。 */
function assertInitialTarget(targetDir: string): { targetExisted: boolean; preserveAuth: boolean } {
  if (!existsSync(targetDir)) return { targetExisted: false, preserveAuth: false };
  const entries = readdirSync(targetDir);
  if (entries.length === 0) return { targetExisted: true, preserveAuth: false };
  if (targetHasOnlyAuthSelector(targetDir)) return { targetExisted: true, preserveAuth: true };
  throw new CliError('目标目录不是空目录，拒绝覆盖', 'INIT_TARGET_NOT_EMPTY');
}

function assertOnlyAuthSelectorStillThere(targetDir: string): void {
  if (!targetHasOnlyAuthSelector(targetDir)) {
    throw new CliError('目标目录在初始化期间被修改，未覆盖未知文件', 'INIT_TARGET_CHANGED');
  }
}

function copyDirectoryContents(sourceDir: string, targetDir: string): void {
  for (const entry of readdirSync(sourceDir)) {
    cpSync(path.join(sourceDir, entry), path.join(targetDir, entry), { recursive: true, errorOnExist: true, force: false });
  }
}

function parsePackFilename(stdout: string): string {
  try {
    const filename = (JSON.parse(stdout) as Array<{ filename?: unknown }>)[0]?.filename;
    if (typeof filename === 'string' && filename) return filename;
  } catch { /* normalized below */ }
  throw new CliError('模板下载失败：npm 未返回安装包', 'TEMPLATE_DOWNLOAD_FAILED');
}

function validateRemoteTemplate(packageDir: string, template: TemplateItem): string {
  const manifestPath = path.join(packageDir, 'template.manifest.json');
  const templateDir = path.join(packageDir, 'template');
  let manifest: RemoteManifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as RemoteManifest; } catch {
    throw new CliError('模板校验失败：缺少或无法读取 template.manifest.json', 'TEMPLATE_INVALID');
  }
  const tags = Array.isArray(manifest.tags) ? manifest.tags : [];
  if (manifest.id !== template.id || manifest.npmName !== template.npmName || manifest.version !== template.version || !tags.includes('runtime') || !template.targets.every((target) => tags.includes(target)) || !existsSync(templateDir)) {
    throw new CliError('模板校验失败：线上模板与受控清单不一致', 'TEMPLATE_INVALID');
  }
  return templateDir;
}

/** 从固定 npm name@version 取得包，仅复制验证后的 template/，禁用生命周期脚本。 */
export async function installRemoteTemplate(input: { template: TemplateItem; targetDir: string }): Promise<void> {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'freelog-template-'));
  const downloadDir = path.join(tempDir, 'download');
  const extractDir = path.join(tempDir, 'extract');
  mkdirSync(downloadDir); mkdirSync(extractDir);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  try {
    let stdout: string;
    try {
      ({ stdout } = await execFile(npm, ['pack', `${input.template.npmName}@${input.template.version}`, '--ignore-scripts', '--json', '--pack-destination', downloadDir], { cwd: tempDir, shell: process.platform === 'win32', windowsHide: true }));
    } catch { throw new CliError(`模板下载失败：${input.template.id}`, 'TEMPLATE_DOWNLOAD_FAILED'); }
    const archivePath = path.join(downloadDir, parsePackFilename(stdout));
    try { await execFile('tar', ['-xzf', archivePath, '-C', extractDir]); } catch {
      throw new CliError(`模板解包失败：${input.template.id}`, 'TEMPLATE_EXTRACT_FAILED');
    }
    copyDirectoryContents(validateRemoteTemplate(path.join(extractDir, 'package'), input.template), input.targetDir);
  } finally { rmSync(tempDir, { recursive: true, force: true }); }
}

/** 同文件系统的 staging 提交；已有空目录逐项原子移动，发现并发变更即停止且绝不删除未知内容。 */
function commitStaging(stagingDir: string, targetDir: string, targetExisted: boolean, preserveAuth: boolean): void {
  if (!targetExisted) {
    renameSync(stagingDir, targetDir);
    return;
  }
  if (preserveAuth) {
    assertOnlyAuthSelectorStillThere(targetDir);
  } else {
    assertInitialTarget(targetDir);
  }
  for (const entry of readdirSync(stagingDir)) {
    const destination = path.join(targetDir, entry);
    if (preserveAuth && entry === '.freelog') {
      for (const stateEntry of readdirSync(path.join(stagingDir, entry))) {
        const stateDestination = path.join(destination, stateEntry);
        if (existsSync(stateDestination)) {
          throw new CliError('目标目录在初始化期间被修改，未覆盖未知文件', 'INIT_TARGET_CHANGED');
        }
        renameSync(path.join(stagingDir, entry, stateEntry), stateDestination);
      }
      rmSync(path.join(stagingDir, entry), { recursive: true, force: true });
      continue;
    }
    if (existsSync(destination)) {
      throw new CliError('目标目录在初始化期间被修改，未覆盖未知文件', 'INIT_TARGET_CHANGED');
    }
    renameSync(path.join(stagingDir, entry), destination);
  }
  rmSync(stagingDir, { recursive: true, force: true });
}

/** 初始化普通资源或固定类型的主题/插件模板工程。 */
export async function initProject(input: InitProjectInput): Promise<IdentityRecord> {
  const targetDir = resolveTargetDir(input);
  return withInitLock(targetDir, async () => {
    // 锁内再次检查，避免确认后另一进程先把目标写成非空。
    const initialTarget = assertInitialTarget(targetDir);
    const shortcut = input.shortcut;
    if (shortcut && input.yes && !input.template) {
      throw new CliError('init theme / widget 使用 --yes 时必须带 --template', 'INIT_TEMPLATE_REQUIRED');
    }
    if (!shortcut && !input.typeCode?.trim()) {
      throw new CliError('请选择资源类型', 'INIT_TYPE_REQUIRED');
    }

    const typeCode = shortcut === 'theme' ? 'RT001' : shortcut === 'widget' ? 'RT002' : (await (input.typeValidator ?? ((code) => getTypeInfo(code, input.typeApis)))(input.typeCode!)).code;
    if (!shortcut && isFixedTemplateType(typeCode)) {
      throw new CliError(
        typeCode === 'RT001' ? '主题请使用 init theme 创建模板工程' : '插件请使用 init widget 创建模板工程',
        'INIT_TEMPLATE_SHORTCUT_REQUIRED',
      );
    }
    const template = shortcut && input.template ? getTemplate(input.template, shortcut) : undefined;
    if (shortcut && !template) throw new CliError('请选择模板', 'INIT_TEMPLATE_REQUIRED');

    const parent = path.dirname(targetDir);
    mkdirSync(parent, { recursive: true });
    const stagingDir = mkdtempSync(path.join(parent, `.${path.basename(targetDir)}.freelog-init-`));
    try {
      if (template) await (input.templateSource ?? installRemoteTemplate)({ template, targetDir: stagingDir });
      const created = createIdentity(stagingDir, {
        subject: 'resource', typeCode, ...(shortcut ? { filePath: 'dist' } : {}),
      });
      repairIndex(stagingDir);
      commitStaging(stagingDir, targetDir, initialTarget.targetExisted, initialTarget.preserveAuth);
      return { ...created, n: created.n };
    } catch (error) {
      rmSync(stagingDir, { recursive: true, force: true });
      throw error;
    }
  });
}
