import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { consola } from 'consola';
import { loadVersionProject, saveVersionProject, tryLoadResourceProject } from '../../config/project.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { offlineResource, onlineResource } from '../onlineService.js';
import { publishVersion } from '../resource/index.js';
import { applyReuseVersionIntent } from '../resource/reuseVersionIntent.js';
import { computeBumpedVersion } from '../resource/publishVersion.js';
import { updateListing } from '../resourceService.js';
import { ensureSynced } from '../sync/index.js';
import { infoPublishFileConstraints } from '../publishFileHints.js';
import { runUpdateListingWizard } from '../updateListingWizard.js';
import { editReleasedVersion } from '../versionEditService.js';
import { assertSemverLike } from '../validation.js';
import { printPreflightLines, summarizeOnlineGates, summarizePublishPreflight } from '../preflightSummary.js';
import { assertStudioOwner, projectStoreForStudioDir, type InteractiveContext } from './context.js';
import { confirmInteractiveWrite, confirmInteractiveOffline } from './interactiveWrite.js';
import { isInteractiveCancelled } from './ephemeralLogin.js';
import { sessionActionDepMenu, sessionActionPolicyMenu } from './sessionActions.js';

/** 工作区下含 resourceId 的 Freelog 子工程目录。 */
export function listFreelogSubdirs(workspaceRoot: string): string[] {
  if (!fs.existsSync(workspaceRoot)) return [];
  return fs
    .readdirSync(workspaceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(workspaceRoot, entry.name))
    .filter((dir) => Boolean(tryLoadResourceProject(dir)?.data.resourceId?.trim()));
}

async function pickStudioSubdir(workspaceRoot: string): Promise<string | null> {
  const subdirs = listFreelogSubdirs(workspaceRoot);
  if (!subdirs.length) {
    consola.info('尚无 Freelog 子工程（需先菜单 1 从文件发行）');
    return null;
  }
  const pick = await p.select({
    message: '选择子工程',
    options: subdirs.map((dir) => ({ value: dir, label: path.basename(dir) })),
  });
  if (p.isCancel(pick)) return null;
  return String(pick);
}

/** studio 维护：发新版（含 publish preflight）。 */
export async function studioActionPublish(projectDir: string): Promise<void> {
  const store = projectStoreForStudioDir(projectDir);
  const synced = await ensureSynced({ store });
  const versionCfg = store.tryLoadVersion();
  const resourceCfg = store.loadResource();

  const mode = await p.select({
    message: '发行方式',
    options: [
      { value: 'manifest', label: '使用 manifest 中的文件与版本意图' },
      { value: 'bump', label: '自动升 patch 后发行（manifest 文件）' },
      { value: 'reuse', label: '复用已发版文件（reuse-version）' },
      { value: 'file', label: '指定新文件路径后发行' },
    ],
  });
  if (p.isCancel(mode)) return;

  let bump = false;
  let reuseVersion: string | undefined;
  let filePath = versionCfg?.filePath?.trim();

  if (mode === 'bump') {
    bump = true;
  } else if (mode === 'reuse') {
    const reuse = await p.text({
      message: '要复用的已发版版本号',
      validate: (v) => (v?.trim() ? undefined : '必填'),
    });
    if (p.isCancel(reuse)) return;
    reuseVersion = String(reuse).trim();
    const targetVersion = computeBumpedVersion(synced.info.latestVersion);
    await applyReuseVersionIntent({
      store,
      resourceId: synced.resource.resourceId!,
      resourceName: synced.resource.resourceName,
      resourceTypeCode: synced.resource.resourceTypeCode,
      userId: synced.resource.userId,
      username: synced.resource.username,
      reuseVersion,
      targetVersion,
    });
  } else if (mode === 'file') {
    const fileAnswer = await p.text({
      message: '发布文件或构建目录路径',
      validate: (v) => {
        const trimmed = String(v ?? '').trim();
        if (!trimmed) return '路径不能为空';
        const resolved = path.resolve(trimmed);
        return fs.existsSync(resolved) ? undefined : '路径不存在';
      },
    });
    if (p.isCancel(fileAnswer)) return;
    filePath = path.resolve(String(fileAnswer).trim());
    const { data } = loadVersionProject(projectDir);
    data.filePath = filePath;
    if (!data.version?.trim()) {
      data.version = computeBumpedVersion(synced.info.latestVersion);
    }
    saveVersionProject(data, projectDir);
  } else if (!filePath) {
    throw cliError(I18N_KEYS.manifest_version_missing, {
      code: 4,
      hint: 'manifest 缺少 filePath，请选择「指定新文件」',
    });
  }

  if (filePath && resourceCfg.resourceTypeCode && !reuseVersion) {
    await infoPublishFileConstraints({
      cwd: projectDir,
      filePath,
      resourceTypeCode: resourceCfg.resourceTypeCode,
      versionConfig: store.tryLoadVersion() || undefined,
    });
  }

  printPreflightLines(await summarizePublishPreflight({ cwd: projectDir }));

  if (!(await confirmInteractiveWrite('确认发行？'))) return;
  const result = await publishVersion({ store, bump: bump && !reuseVersion });
  consola.success(`已发行 ${result.version}（${result.filename}）`);
}

async function studioActionUpdateListing(projectDir: string): Promise<void> {
  const store = projectStoreForStudioDir(projectDir);
  const wizard = await runUpdateListingWizard(store);
  if (!(await confirmInteractiveWrite('确认更新 listing？'))) return;
  await updateListing({
    store,
    title: wizard.title,
    intro: wizard.intro,
    cover: wizard.cover,
    tags: wizard.tags,
  });
  consola.success('已更新 listing');
}

async function studioActionVersionEdit(projectDir: string): Promise<void> {
  const store = projectStoreForStudioDir(projectDir);
  const synced = await ensureSynced({ store });
  const defaultVersion = synced.info.latestVersion || synced.version?.version || '1.0.0';
  const versionAnswer = await p.text({
    message: '已发版版本号',
    defaultValue: defaultVersion,
    validate: (v) => {
      const trimmed = String(v ?? '').trim();
      if (!trimmed) return '必填';
      try {
        assertSemverLike(trimmed);
        return undefined;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    },
  });
  if (p.isCancel(versionAnswer)) return;

  const descriptionAnswer = await p.text({
    message: '版本说明',
    validate: (v) => (v?.trim() ? undefined : '必填'),
  });
  if (p.isCancel(descriptionAnswer)) return;
  if (!(await confirmInteractiveWrite('确认修改已发版说明？'))) return;

  const version = String(versionAnswer).trim();
  await editReleasedVersion({
    store,
    version,
    description: String(descriptionAnswer),
  });
  consola.success(`已更新正式版 ${version} 说明`);
}

function createStudioMaintenanceContext(projectDir: string): InteractiveContext {
  const store = projectStoreForStudioDir(projectDir);
  const resource = store.loadResource();
  return {
    mode: 'studio',
    store,
    resourceId: resource.resourceId,
    resourceTitle: resource.resourceTitle,
    activeProjectDir: projectDir,
  };
}

async function studioActionOnlineMenu(projectDir: string): Promise<void> {
  const store = projectStoreForStudioDir(projectDir);
  const action = await p.select({
    message: '上架 / 下架',
    options: [
      { value: 'online', label: '严格上架' },
      { value: 'offline', label: '下架' },
      { value: 'back', label: '返回' },
    ],
  });
  if (p.isCancel(action) || action === 'back') return;

  if (action === 'online') {
    const ctxSync = await ensureSynced({ store });
    printPreflightLines(summarizeOnlineGates(ctxSync.info).lines);
    if (!(await confirmInteractiveWrite('确认上架？'))) return;
    const result = await onlineResource({ store });
    consola.success(result.already ? '资源已是上架状态' : '已上架');
    return;
  }

  if (!(await confirmInteractiveOffline())) return;
  await offlineResource({ store });
  consola.success('已下架');
}

/** studio 子工程维护子菜单（S=0 + ephemeral auth）。 */
export async function runStudioMaintainShell(projectDir: string): Promise<void> {
  assertStudioOwner(projectDir);
  consola.info(`维护子工程: ${path.basename(projectDir)}`);

  let running = true;
  while (running) {
    const action = await p.select({
      message: '子工程维护',
      options: [
        { value: 'publish', label: '1. 发新版' },
        { value: 'update', label: '2. 改 listing' },
        { value: 'version', label: '3. 改版本说明' },
        { value: 'deps', label: '4. 依赖 / 签约' },
        { value: 'policy', label: '5. 策略' },
        { value: 'online', label: '6. 上架 / 下架' },
        { value: 'back', label: '0. 返回工作区根' },
      ],
    });
    if (p.isCancel(action) || action === 'back') {
      running = false;
      break;
    }

    try {
      switch (action) {
        case 'publish':
          await studioActionPublish(projectDir);
          break;
        case 'update':
          await studioActionUpdateListing(projectDir);
          break;
        case 'version':
          await studioActionVersionEdit(projectDir);
          break;
        case 'deps':
          await sessionActionDepMenu(createStudioMaintenanceContext(projectDir));
          break;
        case 'policy':
          await sessionActionPolicyMenu(createStudioMaintenanceContext(projectDir));
          break;
        case 'online':
          await studioActionOnlineMenu(projectDir);
          break;
        default:
          break;
      }
    } catch (error) {
      if (isInteractiveCancelled(error)) continue;
      const message = error instanceof Error ? error.message : String(error);
      consola.error(message);
    }
  }
}

export async function enterStudioMaintain(workspaceRoot: string): Promise<void> {
  const projectDir = await pickStudioSubdir(workspaceRoot);
  if (!projectDir) return;
  try {
    await runStudioMaintainShell(projectDir);
  } catch (error) {
    if (isInteractiveCancelled(error)) return;
    throw error;
  }
}
