/** 合集独立上下架：不复用单资源身份解析，也不隐式修改策略、目录或表单。 */

import { CliError } from '../../core/errors';
import { confirmWrite } from '../../core/tty';
import { FServiceAPI } from '../../platform/api';
import { assertPlatformAllowed } from '../env';
import { resolveCollectionTarget, type CollectionTargetApis } from './target';

export type CollectionShelfApis = CollectionTargetApis & {
  update?: (params: Record<string, unknown>) => Promise<unknown>;
};

function assertWritable(target: Awaited<ReturnType<typeof resolveCollectionTarget>>): void {
  if (Number(target.info.status) === 2) throw new CliError('冻结合集不能修改上下架状态', 'COLLECTION_FROZEN');
  if (target.info.rssSource === 'yes' || (typeof target.info.feedUrl === 'string' && target.info.feedUrl.trim())) {
    throw new CliError('RSS 合集当前不支持 CLI 上下架', 'COLLECTION_RSS_READONLY');
  }
}

function hasEnabledPolicy(info: Record<string, unknown>): boolean {
  return Array.isArray(info.policies)
    && info.policies.some((policy) => policy && typeof policy === 'object' && Number((policy as Record<string, unknown>).status) === 1);
}

async function writeAndVerifyStatus<TStatus extends 1 | 4>(input: {
  cwd: string;
  selector?: string;
  homeDir?: string;
  yes?: boolean;
  expectedStatus: TStatus;
  action: '上架' | '下架';
  apis?: CollectionShelfApis;
}): Promise<{ resourceId: string; status: TStatus; changed: boolean }> {
  const target = await resolveCollectionTarget(input);
  assertWritable(target);
  if (Number(target.info.status) === input.expectedStatus) {
    return { resourceId: target.resourceId, status: input.expectedStatus, changed: false };
  }
  await confirmWrite(`${input.action}合集\n目标：${target.resourceName}\n授权标识：${target.resourceName}`, input.yes);
  const update = input.apis?.update ?? ((params) => FServiceAPI.Resource.update(params as never));
  try {
    await update({ resourceId: target.resourceId, status: input.expectedStatus });
  } catch (error) {
    // 状态是唯一可重读的幂等事实。请求结果不明时只读回；已达目标可安全确认，
    // 否则保留原始错误，绝不盲目重试。
    try {
      const afterError = await resolveCollectionTarget(input);
      if (Number(afterError.info.status) === input.expectedStatus) {
        return { resourceId: target.resourceId, status: input.expectedStatus, changed: true };
      }
    } catch {
      // 保留原始写错误。
    }
    throw error;
  }
  const verified = await resolveCollectionTarget(input);
  if (Number(verified.info.status) !== input.expectedStatus) {
    throw new CliError(`${input.action}后状态读回不一致`, 'COLLECTION_SHELF_VERIFY_FAILED');
  }
  return { resourceId: target.resourceId, status: input.expectedStatus, changed: true };
}

/** 上架必须已有发布快照和合集自身启用策略；不会代替用户创建或启用策略。 */
export async function onlineCollection(input: {
  cwd: string;
  selector?: string;
  homeDir?: string;
  yes?: boolean;
  apis?: CollectionShelfApis;
}): Promise<{ resourceId: string; status: 1; changed: boolean }> {
  assertPlatformAllowed();
  const target = await resolveCollectionTarget(input);
  assertWritable(target);
  if (Number(target.info.status) === 1) return { resourceId: target.resourceId, status: 1, changed: false };
  if (!target.info.latestVersion) throw new CliError('上架须先发布合集；请先执行 collection publish', 'COLLECTION_ONLINE_NO_VERSION');
  if (!hasEnabledPolicy(target.info)) throw new CliError('上架须至少一条启用的合集自身策略；当前请先在 Console 配置并启用后再试', 'COLLECTION_ONLINE_NO_POLICY');
  return writeAndVerifyStatus({ ...input, expectedStatus: 1, action: '上架' });
}

/** 下架不要求策略或已发布目录；不删除可恢复数据。 */
export async function offlineCollection(input: {
  cwd: string;
  selector?: string;
  homeDir?: string;
  yes?: boolean;
  apis?: CollectionShelfApis;
}): Promise<{ resourceId: string; status: 4; changed: boolean }> {
  assertPlatformAllowed();
  return writeAndVerifyStatus({ ...input, expectedStatus: 4, action: '下架' });
}
