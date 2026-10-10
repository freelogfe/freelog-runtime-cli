/** 合集自动收录规则：独立于目录草稿、listing、发布和上架。 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CliError } from '../../core/errors';
import { confirmWrite } from '../../core/tty';
import { getTypeInfo, type TypeApis } from '../create/typePick';
import { normalizeProjectPath, resolveExistingProjectPath } from '../../local/projectPath';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';

type RuleOperator = 'INCLUDES' | 'NOT_INCLUDES' | 'STARTS_WITH' | 'ENDS_WITH' | 'EQUAL' | 'NOT_EQUAL';
type RuleField = 'title' | 'authIdentity' | 'type';
export type CollectionRule = { field: RuleField; operator: RuleOperator; value: string };
type PlatformRule = { key: 'resourceTitle' | 'authIdentity' | 'resourceTypeCode'; limitOperatorType: RuleOperator; value: string };
export type CollectionRulesState = { serializeStatus: 0 | 1; status: 0 | 1; conditionType: 1 | 2; filterConditions: PlatformRule[] };

export type CollectionCollectRulesApis = CollectionTargetApis & TypeApis & {
  getRules?: (params: Record<string, unknown>) => Promise<unknown>;
  setRules?: (params: Record<string, unknown>) => Promise<unknown>;
  getPublishedItems?: (params: Record<string, unknown>) => Promise<unknown>;
  getDraftItems?: (params: Record<string, unknown>) => Promise<unknown>;
};

function unwrapData(result: unknown): unknown {
  return result && typeof result === 'object' && 'data' in result ? (result as { data?: unknown }).data : result;
}

function asState(result: unknown, fallbackSerializeStatus = 0): CollectionRulesState {
  const raw = unwrapData(result);
  // 新合集/尚未保存过规则时平台返回 null；这不是接口异常，而是关闭自动、无条件的初始状态。
  if (raw === null || raw === undefined) {
    const serializeStatus = Number(fallbackSerializeStatus);
    return { serializeStatus: serializeStatus === 1 ? 1 : 0, status: 0, conditionType: 1, filterConditions: [] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new CliError('平台收录规则响应格式无法识别', 'COLLECTION_RULES_RESPONSE_INVALID');
  }
  const value = raw as Record<string, unknown>;
  // collectRules 响应只含自动收录字段；完结状态属于 resource info，部分环境不会回 serializeStatus。
  const serializeStatus = value.serializeStatus === undefined ? fallbackSerializeStatus : Number(value.serializeStatus);
  const status = Number(value.status);
  const conditionType = Number(value.conditionType);
  const conditions = Array.isArray(value.filterConditions) ? value.filterConditions : [];
  if ((serializeStatus !== 0 && serializeStatus !== 1) || (status !== 0 && status !== 1)
    || (conditionType !== 1 && conditionType !== 2)) {
    throw new CliError(`平台收录规则缺少有效状态字段（收到字段：${Object.keys(value).join('、') || '无'}）`, 'COLLECTION_RULES_RESPONSE_INVALID');
  }
  return {
    serializeStatus: serializeStatus as 0 | 1,
    status: status as 0 | 1,
    conditionType: conditionType as 1 | 2,
    filterConditions: conditions.map((condition): PlatformRule => {
      if (!condition || typeof condition !== 'object') throw new CliError('平台收录规则包含无效条件', 'COLLECTION_RULES_RESPONSE_INVALID');
      const item = condition as Record<string, unknown>;
      const key = item.key;
      const operator = item.limitOperatorType;
      const ruleValue = item.value;
      if ((key !== 'resourceTitle' && key !== 'authIdentity' && key !== 'resourceTypeCode')
        || !['INCLUDES', 'NOT_INCLUDES', 'STARTS_WITH', 'ENDS_WITH', 'EQUAL', 'NOT_EQUAL'].includes(String(operator))
        || typeof ruleValue !== 'string') {
        throw new CliError('平台收录规则包含未知条件', 'COLLECTION_RULES_RESPONSE_INVALID');
      }
      return { key, limitOperatorType: operator as RuleOperator, value: ruleValue };
    }),
  };
}

function assertWritable(target: Awaited<ReturnType<typeof resolveCollectionTarget>>): void {
  if (Number(target.info.status) === 2) throw new CliError('冻结合集不能修改收录规则', 'COLLECTION_FROZEN');
  if (target.info.rssSource === 'yes' || (typeof target.info.feedUrl === 'string' && target.info.feedUrl.trim())) {
    throw new CliError('RSS 合集当前不支持 CLI 收录规则维护', 'COLLECTION_RSS_READONLY');
  }
}

function readRulesFile(cwd: string, source: string): CollectionRule[] {
  const normalized = normalizeProjectPath(cwd, source, { code: 'COLLECTION_RULES_OUTSIDE', message: '规则文件必须位于当前工程内' });
  const resolved = resolveExistingProjectPath(cwd, path.resolve(cwd, normalized), { code: 'COLLECTION_RULES_OUTSIDE', message: '规则文件必须位于当前工程内' });
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(resolved, 'utf8'));
  } catch {
    throw new CliError('规则文件必须是有效 JSON 数组', 'COLLECTION_RULES_JSON_INVALID');
  }
  if (!Array.isArray(value)) throw new CliError('规则文件顶层必须是数组', 'COLLECTION_RULES_JSON_INVALID');
  return value.map((item): CollectionRule => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new CliError('每条规则必须是对象', 'COLLECTION_RULES_JSON_INVALID');
    const value = item as Record<string, unknown>;
    if ((value.field !== 'title' && value.field !== 'authIdentity' && value.field !== 'type')
      || !['INCLUDES', 'NOT_INCLUDES', 'STARTS_WITH', 'ENDS_WITH', 'EQUAL', 'NOT_EQUAL'].includes(String(value.operator))
      || typeof value.value !== 'string') {
      throw new CliError('规则仅支持 title/authIdentity/type、合法操作符和字符串 value', 'COLLECTION_RULES_JSON_INVALID');
    }
    return { field: value.field, operator: value.operator as RuleOperator, value: value.value };
  });
}

async function compileRules(rules: CollectionRule[], loginName: string, apis: CollectionCollectRulesApis): Promise<PlatformRule[]> {
  const typeApis: TypeApis = { getByCode: apis.getByCode };
  return Promise.all(rules.map(async (rule): Promise<PlatformRule> => {
    const value = rule.value.trim();
    if (!value) throw new CliError('收录规则 value 不能为空', 'COLLECTION_RULE_VALUE_REQUIRED');
    if (rule.field === 'title') {
      if (!['INCLUDES', 'NOT_INCLUDES', 'STARTS_WITH', 'ENDS_WITH'].includes(rule.operator) || value.length > 100) {
        throw new CliError('标题规则仅支持 includes/not-includes/starts-with/ends-with，且不超过100字符', 'COLLECTION_RULE_TITLE_INVALID');
      }
      return { key: 'resourceTitle', limitOperatorType: rule.operator, value };
    }
    if (rule.field === 'authIdentity') {
      if (!['INCLUDES', 'NOT_INCLUDES', 'STARTS_WITH', 'ENDS_WITH'].includes(rule.operator) || value.length > 60) {
        throw new CliError('授权标识规则仅支持 includes/not-includes/starts-with/ends-with，且不超过60字符', 'COLLECTION_RULE_AUTH_IDENTITY_INVALID');
      }
      return { key: 'authIdentity', limitOperatorType: rule.operator, value: rule.operator === 'STARTS_WITH' ? `${loginName}/${value}` : value };
    }
    if (rule.operator !== 'EQUAL') throw new CliError('资源类型规则只支持 EQUAL', 'COLLECTION_RULE_TYPE_OPERATOR');
    await getTypeInfo(value, typeApis);
    return { key: 'resourceTypeCode', limitOperatorType: 'EQUAL', value };
  }));
}

function itemList(result: unknown): Record<string, unknown>[] {
  const data = unwrapData(result);
  const list = Array.isArray(data) ? data : data && typeof data === 'object'
    ? ((data as { dataList?: unknown; list?: unknown; items?: unknown }).dataList
      ?? (data as { list?: unknown }).list ?? (data as { items?: unknown }).items)
    : undefined;
  if (!Array.isArray(list)) throw new CliError('平台目录响应格式无法识别', 'COLLECTION_ITEMS_RESPONSE_INVALID');
  return list.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
}

async function readAllItems(resourceId: string, request: (params: Record<string, unknown>) => Promise<unknown>): Promise<Record<string, unknown>[]> {
  const pageSize = 100;
  const all: Record<string, unknown>[] = [];
  for (let skip = 0; ; skip += pageSize) {
    const page = itemList(await request({ resourceId, skip, limit: pageSize, sortField: 'sortId', sortType: 1 }));
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}

function itemFingerprint(items: Record<string, unknown>[]): string[] {
  return items.map((item) => {
    const mounted = item.mountResourceInfo && typeof item.mountResourceInfo === 'object' ? item.mountResourceInfo as Record<string, unknown> : {};
    return JSON.stringify({
      itemId: item.itemId ?? item.id ?? '', resourceId: item.resourceId ?? item.resourceID ?? mounted.resourceId ?? mounted.resourceID ?? '', itemTitle: item.itemTitle ?? '', sortId: item.sortId ?? '',
    });
  });
}

async function assertNoManualDraftDifference(resourceId: string, apis: CollectionCollectRulesApis): Promise<void> {
  const published = apis.getPublishedItems ?? ((params) => FServiceAPI.Resource.getCollectionItems(params as never));
  const draft = apis.getDraftItems ?? ((params) => FServiceAPI.Resource.getCollectionItems_Draft(params as never));
  const [publishedItems, draftItems] = await Promise.all([readAllItems(resourceId, published), readAllItems(resourceId, draft)]);
  const left = itemFingerprint(publishedItems);
  const right = itemFingerprint(draftItems);
  if (left.length !== right.length || left.some((item, index) => item !== right[index])) {
    throw new CliError('目录草稿与已发布目录不同；请先发布手工目录后再开启自动收录', 'COLLECTION_AUTO_DRAFT_DIRTY');
  }
}

function sameState(left: CollectionRulesState, right: CollectionRulesState): boolean {
  return left.serializeStatus === right.serializeStatus && left.status === right.status && left.conditionType === right.conditionType
    && JSON.stringify(left.filterConditions) === JSON.stringify(right.filterConditions);
}

/** 获取平台规则的原始状态，便于 JSON 输出和 set 的合并基线。 */
export async function getCollectionCollectRules(input: { cwd: string; selector?: string; homeDir?: string; apis?: CollectionCollectRulesApis }): Promise<CollectionRulesState> {
  assertPlatformAllowed();
  const target = await resolveCollectionTarget(input);
  const getRules = input.apis?.getRules ?? ((params) => FServiceAPI.Resource.getCollectionCollectRules(params as never));
  return asState(await getRules({ resourceId: target.resourceId }), Number(target.info.serializeStatus));
}

/** 更新显式给出的规则字段；开启自动前确认不会吞掉未发布的手工目录。 */
export async function setCollectionCollectRules(input: {
  cwd: string;
  selector?: string;
  serialize?: 'completed' | 'serial';
  auto?: 'off' | 'all' | 'any';
  rulesFile?: string;
  yes?: boolean;
  homeDir?: string;
  apis?: CollectionCollectRulesApis;
}): Promise<CollectionRulesState> {
  assertPlatformAllowed();
  if (!input.serialize && !input.auto && !input.rulesFile) throw new CliError('至少提供 --serialize、--auto 或 --rules', 'COLLECTION_RULES_EMPTY');
  if ((input.auto === 'all' || input.auto === 'any') && !input.rulesFile) {
    throw new CliError('开启自动收录必须同时提供非空 --rules', 'COLLECTION_AUTO_RULES_REQUIRED');
  }
  const target = await resolveCollectionTarget(input);
  assertWritable(target);
  const apis = input.apis ?? {};
  const getRules = apis.getRules ?? ((params) => FServiceAPI.Resource.getCollectionCollectRules(params as never));
  const current = asState(await getRules({ resourceId: target.resourceId }), Number(target.info.serializeStatus));
  const auth = requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const next: CollectionRulesState = {
    serializeStatus: input.serialize === undefined ? current.serializeStatus : input.serialize === 'completed' ? 1 : 0,
    status: input.auto === undefined ? current.status : input.auto === 'off' ? 0 : 1,
    conditionType: input.auto === 'all' ? 1 : input.auto === 'any' ? 2 : current.conditionType,
    filterConditions: input.rulesFile ? await compileRules(readRulesFile(input.cwd, input.rulesFile), auth.loginName, apis) : current.filterConditions,
  };
  if (next.status === 1 && next.filterConditions.length === 0) throw new CliError('自动收录必须至少有一条规则', 'COLLECTION_AUTO_RULES_REQUIRED');
  if (current.status === 0 && next.status === 1) await assertNoManualDraftDifference(target.resourceId, apis);
  await confirmWrite(`修改合集收录规则\n更新状态：${next.serializeStatus === 1 ? '已完结' : '连载中'}\n自动收录：${next.status === 1 ? (next.conditionType === 1 ? '全部条件' : '任一条件') : '关闭'}\n规则数：${next.filterConditions.length}`, input.yes);
  const setRules = apis.setRules ?? ((params) => FServiceAPI.Resource.setCollectRules(params as never));
  await setRules({ resourceId: target.resourceId, ...next });
  const verifiedTarget = await resolveCollectionTarget(input);
  const verified = asState(await getRules({ resourceId: target.resourceId }), Number(verifiedTarget.info.serializeStatus));
  if (!sameState(next, verified)) throw new CliError('收录规则写入后复核不一致；请重新读取后再继续', 'COLLECTION_RULES_VERIFY_FAILED');
  return verified;
}
