import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { consola } from 'consola';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { depAdd, depList, depRemove, depUpdate } from '../depService.js';
import { depAuthFromMap } from '../depAuthService.js';
import { offlineResource, onlineResource } from '../onlineService.js';
import { policyApplyFromFile, policyList, policySetStatus } from '../policyService.js';
import { updateListing } from '../resourceService.js';
import { searchResources } from '../resourceSearchService.js';
import { ensureSynced } from '../sync/index.js';
import { fetchResourceInfo } from '../sync/fetch.js';
import { ensureSessionVersionIntent } from '../store/sessionVersionSeed.js';
import { runUpdateListingWizard } from '../updateListingWizard.js';
import { editReleasedVersion } from '../versionEditService.js';
import { assertSemverLike } from '../validation.js';
import { printPreflightLines, summarizeOnlineGates } from '../preflightSummary.js';
import type { InteractiveContext } from './context.js';
import { rebindSessionStore } from './context.js';
import { confirmInteractiveWrite, confirmInteractiveOffline } from './interactiveWrite.js';
import {
  runSessionPolicyTemplateApply,
  runSessionPolicyTemplateList,
} from './policyTemplateWizard.js';
import { runSessionPublishWizard } from './runSessionPublishWizard.js';

export async function pickSessionResource(ctx: InteractiveContext): Promise<void> {
  const mode = await p.select({
    message: '选择资源',
    options: [
      { value: 'id', label: '输入 resourceId' },
      { value: 'search', label: '搜索当前账号下的资源' },
      { value: 'new', label: '新建首发（稍后在「发新版」创建）' },
      { value: 'skip', label: '稍后在菜单中选择' },
    ],
  });
  if (p.isCancel(mode)) return;

  if (mode === 'skip') {
    ctx.resourceId = undefined;
    ctx.resourceTitle = undefined;
    rebindSessionStore(ctx);
    return;
  }

  if (mode === 'new') {
    rebindSessionStore(ctx);
    consola.info('已切换到新建首发模式；在「发新版」中创建资源');
    return;
  }

  if (mode === 'search') {
    const query = await p.text({
      message: '搜索关键词（resourceId / 授权名 / 标题）',
      validate: (v) => (v?.trim() ? undefined : '必填'),
    });
    if (p.isCancel(query)) return;
    const hits = await searchResources({ query: String(query).trim() });
    if (!hits.length) {
      consola.warn('未找到匹配资源');
      return;
    }
    const pick = await p.select({
      message: '选择资源',
      options: hits.map((hit) => ({
        value: hit.resourceId,
        label: `${hit.resourceTitle || hit.resourceName || hit.resourceId} · latest ${hit.latestVersion || '—'}`,
      })),
    });
    if (p.isCancel(pick)) return;
    await bindSessionResource(ctx, String(pick));
    return;
  }

  const id = await p.text({
    message: 'resourceId',
    validate: (v) => (v?.trim() ? undefined : '必填'),
  });
  if (p.isCancel(id)) return;
  await bindSessionResource(ctx, String(id).trim());
}

export async function bindSessionResource(
  ctx: InteractiveContext,
  resourceId: string,
): Promise<void> {
  rebindSessionStore(ctx, resourceId);
  try {
    const info = await fetchResourceInfo(resourceId);
    ctx.resourceTitle = info.resourceTitle;
    consola.success(
      `${info.resourceTitle || resourceId} · latest ${info.latestVersion || '—'}`,
    );
  } catch {
    consola.warn('无法拉取资源信息，仍可在菜单中操作');
  }
}

export async function showSessionResourceSummary(ctx: InteractiveContext): Promise<void> {
  if (!ctx.resourceId) {
    consola.warn('尚未选择资源');
    return;
  }
  const info = await fetchResourceInfo(ctx.resourceId);
  consola.info(`resourceId: ${ctx.resourceId}`);
  consola.info(`title: ${info.resourceTitle || '—'}`);
  consola.info(`latest: ${info.latestVersion || '—'} status=${info.status ?? '—'}`);
  consola.info(`owner: ${info.username || '—'} (userId=${info.userId ?? '—'})`);
}

export async function sessionActionPublish(ctx: InteractiveContext): Promise<void> {
  await runSessionPublishWizard(ctx);
}

export async function sessionActionUpdateListing(ctx: InteractiveContext): Promise<void> {
  const wizard = await runUpdateListingWizard(ctx.store);
  if (!(await confirmInteractiveWrite('确认更新 listing？'))) return;
  await updateListing({
    store: ctx.store,
    title: wizard.title,
    intro: wizard.intro,
    cover: wizard.cover,
    tags: wizard.tags,
  });
  consola.success('已更新 listing');
}

export async function sessionActionVersionEdit(ctx: InteractiveContext): Promise<void> {
  const synced = await ensureSynced({ store: ctx.store });
  const defaultVersion =
    synced.info.latestVersion || synced.version?.version || storeVersionFallback(ctx);
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
    message: '版本说明（留空表示不修改）',
    defaultValue: '',
  });
  if (p.isCancel(descriptionAnswer)) return;
  const description = String(descriptionAnswer);
  if (!description.trim()) {
    consola.warn('未填写说明，已取消');
    return;
  }

  if (!(await confirmInteractiveWrite('确认修改已发版说明？'))) return;

  const version = String(versionAnswer).trim();
  ctx.store.saveVersion({ version, filePath: '' });
  await editReleasedVersion({
    store: ctx.store,
    version,
    description,
  });
  consola.success(`已更新正式版 ${version} 说明`);
}

function storeVersionFallback(ctx: InteractiveContext): string {
  return ctx.store.tryLoadVersion()?.version || '1.0.0';
}

async function promptSessionTargetVersion(store: InteractiveContext['store']): Promise<void> {
  if (store.tryLoadVersion()?.version?.trim()) return;
  const answer = await p.text({
    message: '下一版 semver 意图（dep 写入 Store 前必填）',
    defaultValue: '1.0.0',
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
  if (p.isCancel(answer)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
  ensureSessionVersionIntent(store, String(answer).trim());
}

export async function sessionActionDepMenu(ctx: InteractiveContext): Promise<void> {
  const action = await p.select({
    message: '依赖 / 签约',
    options: [
      { value: 'list', label: '列出本地依赖意图' },
      { value: 'tree', label: '读取平台依赖树' },
      { value: 'add', label: '添加依赖' },
      { value: 'remove', label: '移除依赖' },
      { value: 'update', label: '更新 versionRange' },
      { value: 'auth', label: '从 auth-map 补签' },
      { value: 'back', label: '返回主菜单' },
    ],
  });
  if (p.isCancel(action) || action === 'back') return;

  const store = ctx.store;

  if (action === 'list' || action === 'tree') {
    await promptSessionTargetVersion(store);
    const result = await depList({ store, tree: action === 'tree' });
    if (action === 'tree') {
      consola.info('平台依赖树:');
      process.stdout.write(`${JSON.stringify(result.tree, null, 2)}\n`);
    } else if (!result.local.length) {
      consola.info('无本地依赖');
    } else {
      for (const dep of result.local) {
        consola.info(`${dep.resourceId}  ${dep.versionRange || '*'}  ${dep.resourceName || ''}`);
      }
    }
    return;
  }

  if (action === 'auth') {
    const mapPath = await p.text({
      message: 'auth-map.yaml|json 路径',
      defaultValue: 'auth-map.yaml',
      validate: (v) => {
        const resolved = path.resolve(String(v ?? '').trim() || 'auth-map.yaml');
        return fs.existsSync(resolved) ? undefined : '文件不存在';
      },
    });
    if (p.isCancel(mapPath)) return;
    if (!(await confirmInteractiveWrite('确认执行依赖签约？'))) return;
    const result = await depAuthFromMap({
      store,
      policyMap: path.resolve(String(mapPath).trim()),
    });
    consola.success(`依赖签约完成（${result.succeeded.length} 条）`);
    return;
  }

  await promptSessionTargetVersion(store);

  if (action === 'add') {
    const resourceId = await p.text({
      message: '依赖 resourceId',
      validate: (v) => (v?.trim() ? undefined : '必填'),
    });
    if (p.isCancel(resourceId)) return;
    const range = await p.text({
      message: 'versionRange（可选，回车默认）',
      defaultValue: '',
    });
    if (p.isCancel(range)) return;
    if (!(await confirmInteractiveWrite('确认添加依赖？'))) return;
    const deps = await depAdd({
      store,
      resourceId: String(resourceId).trim(),
      versionRange: String(range).trim() || undefined,
    });
    consola.success(`已添加依赖 ${resourceId}（共 ${deps.length}）`);
    return;
  }

  if (action === 'remove') {
    const resourceId = await p.text({
      message: '要移除的 resourceId',
      validate: (v) => (v?.trim() ? undefined : '必填'),
    });
    if (p.isCancel(resourceId)) return;
    if (!(await confirmInteractiveWrite('确认移除依赖？'))) return;
    await depRemove({ store, resourceId: String(resourceId).trim() });
    consola.success(`已移除依赖 ${resourceId}`);
    return;
  }

  if (action === 'update') {
    const resourceId = await p.text({
      message: '依赖 resourceId',
      validate: (v) => (v?.trim() ? undefined : '必填'),
    });
    if (p.isCancel(resourceId)) return;
    const range = await p.text({
      message: '新的 versionRange',
      validate: (v) => (v?.trim() ? undefined : '必填'),
    });
    if (p.isCancel(range)) return;
    if (!(await confirmInteractiveWrite('确认更新依赖？'))) return;
    await depUpdate({
      store,
      resourceId: String(resourceId).trim(),
      versionRange: String(range).trim(),
    });
    consola.success(`已更新 ${resourceId} → ${range}`);
  }
}

export async function sessionActionPolicyMenu(ctx: InteractiveContext): Promise<void> {
  const action = await p.select({
    message: '策略',
    options: [
      { value: 'list', label: '列出策略' },
      { value: 'template-list', label: '查看可选策略模板' },
      { value: 'template-apply', label: '选择模板并应用策略' },
      { value: 'set', label: '启用 / 停用策略' },
      { value: 'apply-file', label: '高级：从策略 JSON 文件应用' },
      { value: 'back', label: '返回主菜单' },
    ],
  });
  if (p.isCancel(action) || action === 'back') return;

  const store = ctx.store;

  if (action === 'list') {
    const policies = await policyList({ store });
    if (!policies.length) {
      consola.warn('无策略');
      return;
    }
    for (const policy of policies) {
      consola.info(`${policy.policyId || '-'}  ${policy.policyName || '-'}  status=${policy.status}`);
    }
    return;
  }

  if (action === 'template-list') {
    await runSessionPolicyTemplateList(ctx);
    return;
  }

  if (action === 'template-apply') {
    await runSessionPolicyTemplateApply(ctx);
    return;
  }

  if (action === 'apply-file') {
    const fromFile = await p.text({
      message: '策略 JSON 文件路径',
      validate: (v) => {
        const trimmed = String(v ?? '').trim();
        if (!trimmed) return '路径不能为空';
        return fs.existsSync(path.resolve(trimmed)) ? undefined : '文件不存在';
      },
    });
    if (p.isCancel(fromFile)) return;
    if (!(await confirmInteractiveWrite('确认应用策略？'))) return;
    const items = await policyApplyFromFile({
      store,
      fromFile: path.resolve(String(fromFile).trim()),
    });
    consola.success(`已应用 ${items.length} 条策略`);
    return;
  }

  const policyId = await p.text({
    message: '策略 ID',
    validate: (v) => (v?.trim() ? undefined : '必填'),
  });
  if (p.isCancel(policyId)) return;
  const statusPick = await p.select({
    message: '状态',
    options: [
      { value: '1', label: '启用 (1)' },
      { value: '0', label: '停用 (0)' },
    ],
  });
  if (p.isCancel(statusPick)) return;
  if (!(await confirmInteractiveWrite('确认修改策略状态？'))) return;
  await policySetStatus({
    store,
    policyId: String(policyId).trim(),
    status: statusPick === '1' ? 1 : 0,
  });
  consola.success(`${statusPick === '1' ? '已启用' : '已停用'} ${policyId}`);
}

export async function sessionActionOnlineMenu(ctx: InteractiveContext): Promise<void> {
  const action = await p.select({
    message: '上架 / 下架',
    options: [
      { value: 'online', label: '严格上架' },
      { value: 'offline', label: '下架' },
      { value: 'back', label: '返回主菜单' },
    ],
  });
  if (p.isCancel(action) || action === 'back') return;

  const store = ctx.store;

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

export async function sessionActionExportProject(ctx: InteractiveContext): Promise<void> {
  const target = await p.text({
    message: '导出到空目录（生成 manifest + state）',
    validate: (v) => {
      const trimmed = String(v ?? '').trim();
      if (!trimmed) return '路径不能为空';
      const resolved = path.resolve(trimmed);
      if (!fs.existsSync(resolved)) return undefined;
      const entries = fs.readdirSync(resolved).filter((name) => name !== '.git');
      return entries.length === 0 ? undefined : '目录须为空或不存在（将自动创建）';
    },
  });
  if (p.isCancel(target)) return;
  const resolved = path.resolve(String(target).trim());
  const exported = ctx.store.exportProject(resolved);
  consola.success(`已导出工程 → ${exported}`);
  consola.info('之后可 cd 该目录并用 login + 工程命令维护（模式 00）');
}
