import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { consola } from 'consola';
import { isInteractive } from '../../core/tty.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import {
  COLLECT_RULE_OPERATORS,
  type CollectRuleKey,
  type CollectRuleOperator,
} from '../collection/collectRulesContract.js';
import {
  collectRulesGet,
  collectRulesSet,
  collectionPolicyApply,
  collectionPolicyList,
  collectionPolicySetStatus,
  collectionPolicyTemplateCommitPreview,
  collectionPolicyTemplatePreview,
  collectionPublish,
  collectionRssBind,
  collectionRssPreview,
  collectionRssSendCode,
  collectionRssStatus,
  collectionRssSync,
  collectionUpdate,
  collectionVersionSet,
  ensureCollectionSynced,
  itemAdd,
  itemRemove,
  itemUpdate,
} from '../collection/index.js';
import { offlineResource, onlineResource } from '../onlineService.js';
import {
  formatPolicyTemplateOption,
  listPolicyTemplates,
  printPolicyTemplateList,
  printPolicyTemplatePreview,
} from '../policyTemplate/index.js';
import {
  printPreflightLines,
  summarizeOnlineGates,
  summarizePublishPreflight,
} from '../preflightSummary.js';
import { projectStoreFromCwd } from '../store/index.js';
import { collectionStoreFromCwd } from '../store/collectionStore.js';
import { runCollectionUpdateWizard } from '../collectionUpdateWizard.js';
import { confirmInteractiveOffline, confirmInteractiveWrite } from './interactiveWrite.js';
import {
  promptPolicyTemplateName,
  promptPolicyTemplateParams,
} from './policyTemplateWizard.js';

async function promptRequiredText(message: string, defaultValue?: string): Promise<string | null> {
  const answer = await p.text({
    message,
    defaultValue,
    validate: (value) => (String(value ?? '').trim() ? undefined : '必填'),
  });
  return p.isCancel(answer) ? null : String(answer).trim();
}

function collectionTypeCode(cwd: string): string {
  const typeCode = collectionStoreFromCwd(cwd).load().resourceTypeCode?.trim();
  if (!typeCode) {
    throw cliError('当前合集缺少 resourceTypeCode，无法加载策略模板', { code: 4 });
  }
  return typeCode;
}

async function runCollectionPolicyMenu(cwd: string): Promise<void> {
  const action = await p.select({
    message: '合集策略',
    options: [
      { value: 'list', label: '列出策略' },
      { value: 'template-list', label: '查看可选策略模板' },
      { value: 'template-apply', label: '选择模板并应用策略' },
      { value: 'set', label: '启用 / 停用策略' },
      { value: 'apply-file', label: '高级：从策略 JSON 文件应用' },
      { value: 'back', label: '返回合集菜单' },
    ],
  });
  if (p.isCancel(action) || action === 'back') return;

  if (action === 'list') {
    const policies = await collectionPolicyList({ cwd });
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
    printPolicyTemplateList(
      await listPolicyTemplates({ resourceTypeCodes: [collectionTypeCode(cwd)] }),
    );
    return;
  }

  if (action === 'template-apply') {
    const templates = await listPolicyTemplates({ resourceTypeCodes: [collectionTypeCode(cwd)] });
    if (!templates.length) {
      printPolicyTemplateList(templates);
      return;
    }
    const templateId = await p.select({
      message: '选择合集策略模板',
      options: templates.map((template) => ({
        value: template.id,
        label: formatPolicyTemplateOption(template),
      })),
    });
    if (p.isCancel(templateId)) return;
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;

    const policyName = await promptPolicyTemplateName(template.title);
    if (!policyName) return;
    const params = await promptPolicyTemplateParams(template.inputs);
    if (!params) return;

    const preview = await collectionPolicyTemplatePreview({
      cwd,
      templateId: template.id,
      policyName,
      params,
    });
    printPolicyTemplatePreview(preview);
    if (!(await confirmInteractiveWrite('确认从模板应用合集策略？'))) return;

    const applied = await collectionPolicyTemplateCommitPreview({ cwd, preview });
    consola.success(`已从模板应用合集策略：${applied.policyName}`);
    return;
  }

  if (action === 'apply-file') {
    const fromFile = await promptRequiredText('策略 JSON 文件路径');
    if (!fromFile) return;
    const resolved = path.resolve(cwd, fromFile);
    if (!fs.existsSync(resolved)) {
      consola.error('文件不存在');
      return;
    }
    if (!(await confirmInteractiveWrite('确认应用合集策略文件？'))) return;
    const items = await collectionPolicyApply({ cwd, fromFile: resolved });
    consola.success(`已应用 ${items.length} 条合集策略`);
    return;
  }

  const policyId = await promptRequiredText('策略 ID');
  if (!policyId) return;
  const status = await p.select({
    message: '状态',
    options: [
      { value: '1', label: '启用 (1)' },
      { value: '0', label: '停用 (0)' },
    ],
  });
  if (p.isCancel(status)) return;
  if (!(await confirmInteractiveWrite('确认修改合集策略状态？'))) return;
  await collectionPolicySetStatus({
    cwd,
    policyId,
    status: status === '1' ? 1 : 0,
  });
  consola.success(`${status === '1' ? '已启用' : '已停用'} ${policyId}`);
}

async function runCollectionListingMenu(cwd: string): Promise<void> {
  const wizard = await runCollectionUpdateWizard({ cwd });
  if (!(await confirmInteractiveWrite('确认更新合集 listing / display？'))) return;
  await collectionUpdate({
    cwd,
    title: wizard.title,
    intro: wizard.intro,
    cover: wizard.cover,
    tags: wizard.tags,
    displaySort: wizard.displaySort,
    displayTitle: wizard.displayTitle,
    displayNo: wizard.displayNo,
    displayImage: wizard.displayImage,
    displayDescr: wizard.displayDescr,
    displayView: wizard.displayView,
  });
  consola.success('已更新合集');
}

async function runCollectionVersionMenu(cwd: string): Promise<void> {
  const description = await promptRequiredText('合集版本说明');
  if (!description) return;
  await collectionVersionSet({ cwd, description });
  consola.success('已更新合集发布说明意图');
}

async function runCollectionItemMenu(cwd: string): Promise<void> {
  const action = await p.select({
    message: '合集目录草稿',
    options: [
      { value: 'add', label: '添加已有资源到目录草稿' },
      { value: 'update', label: '修改目录项标题' },
      { value: 'remove', label: '移除目录项' },
      { value: 'import-dir', label: '从本地目录导入多个资源（显示命令）' },
      { value: 'back', label: '返回合集菜单' },
    ],
  });
  if (p.isCancel(action) || action === 'back') return;

  if (action === 'import-dir') {
    consola.info('该流程涉及条目资源类型、分批、策略、失败恢复，建议使用专门命令：');
    consola.info('freelog-cli collection item import-dir <目录> --resource-type <leaf-code> --yes --env dev');
    return;
  }

  if (action === 'add') {
    const target = await promptRequiredText('resourceId 或本地路径');
    if (!target) return;
    const title = await p.text({ message: '条目标题（可选）', defaultValue: '' });
    if (p.isCancel(title)) return;
    if (!(await confirmInteractiveWrite('确认添加目录项？'))) return;
    const result = await itemAdd({
      cwd,
      target,
      title: String(title).trim() || undefined,
    });
    consola.success(`已添加目录项 ${result.resourceId}`);
    return;
  }

  const itemId = await promptRequiredText('目录项 itemId');
  if (!itemId) return;

  if (action === 'remove') {
    if (!(await confirmInteractiveWrite('确认移除目录项？'))) return;
    await itemRemove({ cwd, itemIds: itemId.split(',').map((id) => id.trim()).filter(Boolean) });
    consola.success('已移除目录项');
    return;
  }

  const title = await promptRequiredText('新标题');
  if (!title) return;
  if (!(await confirmInteractiveWrite('确认修改目录项标题？'))) return;
  await itemUpdate({ cwd, itemId, title });
  consola.success('已更新目录项标题');
}

async function runCollectionPublishMenu(cwd: string): Promise<void> {
  printPreflightLines(await summarizePublishPreflight({ cwd }));
  if (!(await confirmInteractiveWrite('确认发布合集？'))) return;
  const result = await collectionPublish({ cwd });
  consola.success(`已发布合集（draft items=${result.itemCount}）`);
}

async function runCollectionCollectRulesMenu(cwd: string): Promise<void> {
  const action = await p.select({
    message: 'collect-rules 自动收录',
    options: [
      { value: 'get', label: '查看当前规则' },
      { value: 'set-simple', label: '设置一条简单规则' },
      { value: 'from-file', label: '高级：从 JSON 文件设置' },
      { value: 'back', label: '返回合集菜单' },
    ],
  });
  if (p.isCancel(action) || action === 'back') return;

  if (action === 'get') {
    consola.info(JSON.stringify(await collectRulesGet({ cwd }), null, 2));
    return;
  }

  if (action === 'from-file') {
    const fromFile = await promptRequiredText('collect-rules JSON 文件路径');
    if (!fromFile) return;
    if (!(await confirmInteractiveWrite('确认设置 collect-rules？'))) return;
    await collectRulesSet({ cwd, fromFile });
    consola.success('已更新 collect-rules');
    return;
  }

  const status = await p.select({
    message: '自动收录开关',
    options: [
      { value: '1', label: '开启' },
      { value: '0', label: '关闭' },
    ],
  });
  if (p.isCancel(status)) return;
  const conditionType = await p.select({
    message: '条件关系',
    options: [
      { value: '1', label: '全部满足（every）' },
      { value: '2', label: '任一满足（some）' },
    ],
  });
  if (p.isCancel(conditionType)) return;
  const key = await p.select({
    message: '条件字段',
    options: [
      { value: 'resourceTitle', label: '资源标题' },
      { value: 'resourceTypeCode', label: '资源类型 code' },
      { value: 'authIdentity', label: '授权身份' },
    ],
  });
  if (p.isCancel(key)) return;
  const operators =
    key === 'resourceTypeCode'
      ? ['EQUAL']
      : COLLECT_RULE_OPERATORS.filter((operator) =>
          ['INCLUDES', 'NOT_INCLUDES', 'STARTS_WITH', 'ENDS_WITH'].includes(operator),
        );
  const operator = await p.select({
    message: '匹配方式',
    options: operators.map((value) => ({ value, label: value })),
  });
  if (p.isCancel(operator)) return;
  const value = await promptRequiredText('匹配值');
  if (!value) return;
  if (!(await confirmInteractiveWrite('确认设置 collect-rules？'))) return;
  await collectRulesSet({
    cwd,
    status: status === '1' ? 1 : 0,
    conditionType: conditionType === '1' ? 1 : 2,
    filterConditions: [
      {
        key: key as CollectRuleKey,
        limitOperatorType: operator as CollectRuleOperator,
        value,
      },
    ],
  });
  consola.success('已更新 collect-rules');
}

async function runCollectionRssMenu(cwd: string): Promise<void> {
  const action = await p.select({
    message: 'RSS 合集',
    options: [
      { value: 'inspect', label: '预检 feed URL' },
      { value: 'send-code', label: '发送邮箱验证码' },
      { value: 'bind', label: '绑定 feed URL' },
      { value: 'status', label: '查看同步状态' },
      { value: 'sync', label: '触发同步' },
      { value: 'back', label: '返回合集菜单' },
    ],
  });
  if (p.isCancel(action) || action === 'back') return;

  if (action === 'status') {
    consola.info(JSON.stringify(await collectionRssStatus({ cwd }), null, 2));
    return;
  }

  if (action === 'sync') {
    if (!(await confirmInteractiveWrite('确认触发 RSS 同步？'))) return;
    await collectionRssSync({ cwd });
    consola.success('RSS 同步完成');
    return;
  }

  const feedUrl = await promptRequiredText('RSS feed URL');
  if (!feedUrl) return;

  if (action === 'inspect') {
    consola.info(JSON.stringify(await collectionRssPreview({ cwd, feedUrl }), null, 2));
    return;
  }

  if (action === 'send-code') {
    if (!(await confirmInteractiveWrite('确认发送 RSS 验证码？'))) return;
    await collectionRssSendCode({ cwd, feedUrl });
    consola.success('验证码已发送，请查邮箱后继续 bind');
    return;
  }

  const code = await promptRequiredText('邮箱验证码');
  if (!code) return;
  const pubStartDate = await p.text({ message: '收录起始日期 YYYY-MM-DD（可选）', defaultValue: '' });
  if (p.isCancel(pubStartDate)) return;
  const pubEndDate = await p.text({ message: '收录结束日期 YYYY-MM-DD（可选）', defaultValue: '' });
  if (p.isCancel(pubEndDate)) return;
  const force = await p.confirm({
    message: '如果平台提示 GUID 大面积不匹配，是否允许作为全新单集处理？',
    initialValue: false,
  });
  if (p.isCancel(force)) return;
  if (!(await confirmInteractiveWrite('确认绑定 RSS？'))) return;
  await collectionRssBind({
    cwd,
    feedUrl,
    code,
    pubStartDate: String(pubStartDate).trim() || undefined,
    pubEndDate: String(pubEndDate).trim() || undefined,
    force: Boolean(force),
    confirmed: true,
  });
  consola.success('已绑定 RSS');
}

async function runCollectionOnlineMenu(cwd: string): Promise<void> {
  const action = await p.select({
    message: '合集上架 / 下架',
    options: [
      { value: 'online', label: '严格上架' },
      { value: 'offline', label: '下架' },
      { value: 'back', label: '返回合集菜单' },
    ],
  });
  if (p.isCancel(action) || action === 'back') return;

  const store = projectStoreFromCwd(cwd);
  if (action === 'online') {
    const ctx = await ensureCollectionSynced({ cwd });
    printPreflightLines(summarizeOnlineGates(ctx.info).lines);
    if (!(await confirmInteractiveWrite('确认上架合集？'))) return;
    const result = await onlineResource({ store });
    consola.success(result.already ? '合集已是上架状态' : '已上架合集');
    return;
  }

  if (!(await confirmInteractiveOffline())) return;
  await offlineResource({ store });
  consola.success('已下架合集');
}

/**
 * 合集工程维护壳：把 start 的“创建或维护合集”在已有合集工程中落成连续菜单。
 *
 * 复杂结构输入仍保留显式命令/JSON 文件入口，但策略模板、listing、发布、RSS 和 collect-rules
 * 都从同一处进入，避免用户在主流程里背一长串 collection 子命令。
 */
export async function runCollectionShell(cwd?: string): Promise<void> {
  if (!isInteractive()) {
    throw cliError(I18N_KEYS.session_interactive_tty_required, {
      code: 4,
      hint: '脚本请使用 freelog-cli collection <subcommand> 显式命令',
    });
  }
  const root = cwd || process.cwd();
  if (!collectionStoreFromCwd(root).tryLoad()) {
    throw cliError('当前目录不是合集工程', {
      code: 4,
      hint: '先运行 freelog-cli init collection <目录>，或进入已有合集工程目录',
    });
  }

  let running = true;
  while (running) {
    const collection = collectionStoreFromCwd(root).load();
    consola.info(
      collection.resourceId
        ? `当前合集: ${collection.resourceTitle || '—'} (${collection.resourceId})`
        : '当前合集: （尚未创建合集壳）',
    );

    const action = await p.select({
      message: '接下来要做什么？',
      options: [
        { value: 'update', label: '1. 改 listing / 展示设置' },
        { value: 'item', label: '2. 管理目录草稿' },
        { value: 'version', label: '3. 写合集发布说明' },
        { value: 'publish', label: '4. 发布合集版本' },
        { value: 'policy', label: '5. 策略' },
        { value: 'collect-rules', label: '6. collect-rules 自动收录' },
        { value: 'rss', label: '7. RSS' },
        { value: 'online', label: '8. 上架 / 下架' },
        { value: 'exit', label: '0. 退出' },
      ],
    });
    if (p.isCancel(action) || action === 'exit') break;

    try {
      switch (action) {
        case 'update':
          await runCollectionListingMenu(root);
          break;
        case 'item':
          await runCollectionItemMenu(root);
          break;
        case 'version':
          await runCollectionVersionMenu(root);
          break;
        case 'publish':
          await runCollectionPublishMenu(root);
          break;
        case 'policy':
          await runCollectionPolicyMenu(root);
          break;
        case 'collect-rules':
          await runCollectionCollectRulesMenu(root);
          break;
        case 'rss':
          await runCollectionRssMenu(root);
          break;
        case 'online':
          await runCollectionOnlineMenu(root);
          break;
        default:
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      consola.error(message);
    }
  }

  consola.info('合集维护已结束。');
}
