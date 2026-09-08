/** 只创建本地单资源工程；全部内容先落 staging，再安全提交到目标。 */

import { execFile as execFileCallback } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { CliError } from '../../core/errors';
import { getTypeInfo, type TypeApis, type TypeNode } from '../create/typePick';
import { createIdentity } from '../../local/identity';
import { repairIndex } from '../../local/indexFile';
import { writeTemplateCache } from '../../local/template';
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

function normalizeProjectName(raw: string): string {
  const value = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return value || 'resource';
}

/** 将可选目录参数解析为绝对目标目录。 */
export function resolveTargetDir(input: Pick<InitProjectInput, 'cwd' | 'dir'>): string {
  return input.dir ? (path.isAbsolute(input.dir) ? input.dir : path.resolve(input.cwd, input.dir)) : path.resolve(input.cwd);
}

function assertEmptyTarget(targetDir: string): void {
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    throw new CliError('目标目录不是空目录，拒绝覆盖', 'INIT_TARGET_NOT_EMPTY');
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
function commitStaging(stagingDir: string, targetDir: string, targetExisted: boolean): void {
  if (!targetExisted) {
    renameSync(stagingDir, targetDir);
    return;
  }
  assertEmptyTarget(targetDir);
  for (const entry of readdirSync(stagingDir)) {
    const destination = path.join(targetDir, entry);
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
  assertEmptyTarget(targetDir);
  const targetExisted = existsSync(targetDir);
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
    if (template) {
      writeTemplateCache(stagingDir, created.n, {
        templateId: template.id, templateVersion: template.version, npmName: template.npmName,
        projectName: normalizeProjectName(path.basename(targetDir)), projectVersion: '0.1.0',
      });
    }
    repairIndex(stagingDir);
    commitStaging(stagingDir, targetDir, targetExisted);
    return { ...created, n: created.n };
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}
