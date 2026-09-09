/**
 * 首版提交编排：门禁（没 latest、稿不能是更新稿）→ --prepare 备稿（上传+解析）→ --yes 提交。
 * 版本号写死 1.0.0，禁止 inherit；提交前再查一次线上 latest（防并发抢先）。POST 只发生在 submit.ts。
 */

import { CliError } from '../../core/errors';
import { deleteDraft, draftSummary, emptyDraft, readDraft, writeDraft } from '../../local/draft';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { evaluateGates, resolveBoundIdentity } from './gates';
import { submitVersion, type SubmitApis } from './submit';
import { confirmLocalPath, uploadAndAnalyze, type FileApis } from './file';
import { unwrapData } from '../../platform/unwrap';
import { resolveArtifactPath } from './artifact';
import { withProjectLock } from '../../local/lock';

export type CreateVersionApis = SubmitApis & FileApis & {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};



/** 首版全流程：门禁 → （--prepare 或无稿时）上传解析备稿 → --yes 时再查 latest 后提交 1.0.0。 */
export async function runCreateVersion(input: {
  cwd: string;
  file?: string;
  artifact?: string;
  prepare?: boolean;
  reset?: boolean;
  /** 公开命令层在完成 TTY/非 TTY 确认后提供；领域层不接受裸 reset 删除。 */
  confirmReset?: (summary: string) => Promise<boolean>;
  yes?: boolean;
  homeDir?: string;
  apis?: CreateVersionApis;
}): Promise<string> {
  return withProjectLock(
    input.cwd,
    () => runCreateVersionLocked(input),
    'create-version',
  );
}

/** 整次读稿、上传、复查、提交和删稿必须在同一个工作区临界区内。 */
async function runCreateVersionLocked(input: {
  cwd: string;
  file?: string;
  artifact?: string;
  prepare?: boolean;
  reset?: boolean;
  confirmReset?: (summary: string) => Promise<boolean>;
  yes?: boolean;
  homeDir?: string;
  apis?: CreateVersionApis;
}): Promise<string> {
  assertPlatformAllowed();
  requireAuth({ cwd: input.cwd, homeDir: input.homeDir });
  const identity = resolveBoundIdentity(input.cwd, input.file);
  const infoApi =
    input.apis?.info ?? ((params) => FServiceAPI.Resource.info(params as never));
  const info = unwrapData(
    await infoApi({
      resourceIdOrName: identity.resourceId,
      isLoadLatestVersionInfo: 1,
    }),
  );
  const latestVersion = info.latestVersion ? String(info.latestVersion) : undefined;
  const existingDraft = readDraft(input.cwd, identity.n);
  // reset 的目标是重建首版稿，因此门禁不应先因旧 update 稿阻断；但已有线上版本仍必须先失败。
  evaluateGates({ latestVersion, draft: input.reset ? undefined : existingDraft }, 'create-version');
  const artifact = resolveArtifactPath(input.cwd, identity, input.file, input.artifact);
  if (!input.prepare && !input.yes) {
    throw new CliError('提交请加 --yes', 'CREATE_VERSION_NEED_YES');
  }
  // reset 是有损操作；必须在确认前验证最终会上传的本地路径，不让缺文件清掉旧稿。
  if (input.reset) {
    confirmLocalPath(identity, artifact, input.yes, input.cwd);
  }

  let draft = existingDraft;
  if (input.reset && existingDraft) {
    if (!input.confirmReset) {
      throw new CliError('请先确认丢弃工作稿', 'RESET_CONFIRMATION_REQUIRED');
    }
    if (!await input.confirmReset(draftSummary(existingDraft))) {
      return '已取消';
    }
    deleteDraft(input.cwd, identity.n);
    draft = undefined;
  }

  if (!draft || input.prepare || artifact) {
    writeDraft(input.cwd, identity.n, draft ?? emptyDraft());
  }

  if (input.prepare) {
    await uploadAndAnalyze({
      cwd: input.cwd,
      identity,
      file: artifact,
      yes: input.yes,
      apis: input.apis,
    });
    return '已备稿，未提交';
  }
  // 每一次真实提交都从当前磁盘重算 sha，绝不复用工作稿里的旧文件引用。
  await uploadAndAnalyze({
    cwd: input.cwd,
    identity,
    file: artifact,
    yes: input.yes,
    apis: input.apis,
  });

  const again = unwrapData(
    await infoApi({
      resourceIdOrName: identity.resourceId,
      isLoadLatestVersionInfo: 1,
    }),
  );
  if (again.latestVersion) {
    // i18n: cli.gates.create_has_latest
    throw new CliError(
      `这个资源已经有发行版本。线上 latest 是 ${again.latestVersion}，请用 update-version。`,
      'GATE_USE_UPDATE',
    );
  }

  await submitVersion({
    cwd: input.cwd,
    identity,
    version: '1.0.0',
    apis: input.apis,
  });
  return '1.0.0';
}
