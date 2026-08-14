import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { consola } from 'consola';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { runCreateWizard } from '../createWizard.js';
import {
  applySessionPublishIntent,
  createThenPublish,
  publishVersion,
} from '../resource/index.js';
import { computeBumpedVersion } from '../resource/publishVersion.js';
import { ensureOperationContext } from '../sync/operationContext.js';
import { infoPublishFileConstraints } from '../publishFileHints.js';
import { assertSemverLike } from '../validation.js';
import type { InteractiveContext } from './context.js';
import { confirmInteractiveWrite } from './interactiveWrite.js';

export interface SessionPublishWizardResult {
  version: string;
  resourceId?: string;
  resourceTitle?: string;
}

async function promptFilePath(): Promise<string> {
  const answer = await p.text({
    message: '发布文件或构建目录路径',
    validate: (value) => {
      const trimmed = String(value ?? '').trim();
      if (!trimmed) return '路径不能为空';
      const resolved = path.resolve(trimmed);
      if (!fs.existsSync(resolved)) return '路径不存在';
      return undefined;
    },
  });
  if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
  return path.resolve(String(answer).trim());
}

async function promptVersion(opts: {
  defaultVersion?: string;
  allowBump: boolean;
}): Promise<{ version: string; bump?: boolean }> {
  if (opts.allowBump) {
    const mode = await p.select({
      message: '版本号',
      options: [
        { value: 'bump', label: '基于平台 latest 自动升 patch' },
        { value: 'manual', label: '手动输入 semver' },
      ],
    });
    if (p.isCancel(mode)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    if (mode === 'bump') {
      return { version: '', bump: true };
    }
  }

  const answer = await p.text({
    message: 'semver 版本号',
    defaultValue: opts.defaultVersion || '1.0.0',
    validate: (value) => {
      const trimmed = String(value ?? '').trim();
      if (!trimmed) return '版本号不能为空';
      try {
        assertSemverLike(trimmed);
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  });
  if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
  return { version: String(answer).trim() };
}

async function promptOptionalDescription(): Promise<string | undefined> {
  const answer = await p.text({
    message: '版本说明（可选，回车跳过）',
    defaultValue: '',
  });
  if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
  const trimmed = String(answer).trim();
  return trimmed || undefined;
}

/** session 发新版向导 → applySessionPublishIntent / createThenPublish + publishVersion */
export async function runSessionPublishWizard(
  ctx: InteractiveContext,
): Promise<SessionPublishWizardResult | null> {
  const store = ctx.store;
  const hasResource = Boolean(ctx.resourceId?.trim());

  let publishMode: 'file' | 'reuse' = 'file';
  if (hasResource) {
    const modePick = await p.select({
      message: '发行方式',
      options: [
        { value: 'file', label: '上传新文件 / 目录' },
        { value: 'reuse', label: '复用已发版文件（reuse-version）' },
      ],
    });
    if (p.isCancel(modePick)) return null;
    publishMode = modePick as 'file' | 'reuse';
  }

  let file: string | undefined;
  let reuseVersion: string | undefined;
  if (publishMode === 'file') {
    file = await promptFilePath();
  } else {
    const reuse = await p.text({
      message: '要复用的已发版版本号',
      validate: (v) => (v?.trim() ? undefined : '必填'),
    });
    if (p.isCancel(reuse)) return null;
    reuseVersion = String(reuse).trim();
  }

  let version = '1.0.0';
  let bump = false;
  if (hasResource) {
    const ctxInfo = await ensureOperationContext({ store });
    const picked = await promptVersion({
      defaultVersion: computeBumpedVersion(ctxInfo.platform.latestVersion),
      allowBump: true,
    });
    bump = Boolean(picked.bump);
    version = picked.version;
    if (bump) {
      version = computeBumpedVersion(ctxInfo.platform.latestVersion);
    }
  } else {
    const picked = await promptVersion({ defaultVersion: '1.0.0', allowBump: false });
    version = picked.version;
  }

  const description = await promptOptionalDescription();

  if (!hasResource) {
    const create = await runCreateWizard({});
    if (!(await confirmInteractiveWrite('确认首发并发行？'))) return null;

    const result = await createThenPublish({
      store,
      title: create.title,
      typeCode: create.typeCode,
      name: create.name,
      resourceTypeName: create.resourceTypeName,
      file: file!,
      version,
      description,
    });

    const resource = store.loadResource();
    ctx.resourceId = resource.resourceId;
    ctx.resourceTitle = resource.resourceTitle;
    consola.success(
      `已首发并发行 ${result.version}（resourceId=${resource.resourceId}）`,
    );
    return {
      version: result.version,
      resourceId: resource.resourceId,
      resourceTitle: resource.resourceTitle,
    };
  }

  if (file && publishMode === 'file') {
    const resourceCfg = store.loadResource();
    if (resourceCfg.resourceTypeCode) {
      await infoPublishFileConstraints({
        cwd: store.rootDir(),
        filePath: file,
        resourceTypeCode: resourceCfg.resourceTypeCode,
        versionConfig: { version, filePath: file },
      });
    }
  }

  if (!(await confirmInteractiveWrite('确认发行？'))) return null;

  await applySessionPublishIntent({
    store,
    file,
    reuseVersion,
    version: bump ? undefined : version,
    bump,
    description,
  });
  const result = await publishVersion({ store });
  const resource = store.loadResource();
  consola.success(`已发行 ${result.version}（${result.filename}）`);
  return {
    version: result.version,
    resourceId: resource.resourceId,
    resourceTitle: resource.resourceTitle,
  };
}
