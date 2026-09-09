/**
 * 更新版本提交编排：号必须严格大于 latest（--version 或 --bump）→ 无稿时先按 latest 拉 → 提交。
 * 稿的 fromVersion 与底对不上时 --yes 拒绝（UPDATE_VERSION_MISMATCH）；提交前复查 latest 防并发。POST 只发生在 submit.ts。
 */

import semver from 'semver';
import { CliError } from '../../core/errors';
import { deleteDraft, draftSummary, readDraft } from '../../local/draft';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { evaluateGates, resolveBoundIdentity } from './gates';
import { submitVersion, type SubmitApis } from './submit';
import { draftPull } from './draftPull';
import { confirmLocalPath, uploadAndAnalyze, type FileApis } from './file';
import { unwrapData } from '../../platform/unwrap';
import { resolveArtifactPath } from './artifact';
import { withProjectLock } from '../../local/lock';

export type UpdateVersionApis = SubmitApis & FileApis & {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
  resourceVersionInfo1?: (params: Record<string, unknown>) => Promise<unknown>;
};



/** 更新版本全流程：门禁 → 稿对底校验（不匹配拒/无稿先拉）→ 算新号（须 > latest，含提交前复查）→ 提交。 */
export async function runUpdateVersion(input: {
  cwd: string;
  file?: string;
  artifact?: string;
  version?: string;
  bump?: string;
  reuseVersion?: string;
  reset?: boolean;
  /** 公开命令层在完成 TTY/非 TTY 确认后提供；领域层不接受裸 reset 删除。 */
  confirmReset?: (summary: string) => Promise<boolean>;
  yes?: boolean;
  homeDir?: string;
  apis?: UpdateVersionApis;
}): Promise<string> {
  return withProjectLock(
    input.cwd,
    () => runUpdateVersionLocked(input),
    'update-version',
  );
}

/** 整次拉稿、上传、复查、提交和删稿是一个本地临界区，禁止中途换稿。 */
async function runUpdateVersionLocked(input: {
  cwd: string;
  file?: string;
  artifact?: string;
  version?: string;
  bump?: string;
  reuseVersion?: string;
  reset?: boolean;
  confirmReset?: (summary: string) => Promise<boolean>;
  yes?: boolean;
  homeDir?: string;
  apis?: UpdateVersionApis;
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
  const source = input.reuseVersion ?? latestVersion;
  // reset 会丢掉旧稿后按回显源重建，因此门禁仅先判断线上是否存在版本。
  evaluateGates({ latestVersion, draft: input.reset ? undefined : existingDraft, reuseVersion: input.reuseVersion }, 'update-version');
  const artifact = resolveArtifactPath(input.cwd, identity, input.file, input.artifact);
  // 不重置时，保持“先说明稿来源不匹配，再谈新号”的既有路由语义。
  if (
    !input.reset &&
    input.yes &&
    existingDraft?.fromVersion &&
    source &&
    existingDraft.fromVersion !== source
  ) {
    throw new CliError(
      `稿来自 ${existingDraft.fromVersion}、底是 ${source}。请 version draft pull 或 --reuse-version`,
      'UPDATE_VERSION_MISMATCH',
    );
  }
  const next = resolveNextVersion(latestVersion!, input.version, input.bump);
  if (!semver.gt(next, latestVersion!)) {
    throw new CliError(
      `线上已经是 ${latestVersion}，不能发 ${next}`,
      'UPDATE_VERSION_NOT_GREATER',
    );
  }
  if (!input.yes) {
    throw new CliError('提交请加 --yes', 'UPDATE_VERSION_NEED_YES');
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

  if (input.yes && draft && !draft.fromVersion && input.reuseVersion === undefined) {
    // i18n: cli.update_version.first_draft
    throw new CliError('请先 version draft pull --yes', 'UPDATE_VERSION_FIRST_DRAFT');
  }

  if (!draft) {
    await draftPull({
      cwd: input.cwd,
      file: input.file,
      version: source,
      yes: true,
      homeDir: input.homeDir,
      apis: input.apis,
    });
    draft = readDraft(input.cwd, identity.n);
  } else if (
    input.yes &&
    draft.fromVersion &&
    source &&
    draft.fromVersion !== source
  ) {
    // i18n: cli.update_version.mismatch
    throw new CliError(
      `稿来自 ${draft.fromVersion}、底是 ${source}。请 version draft pull 或 --reuse-version`,
      'UPDATE_VERSION_MISMATCH',
    );
  }

  // 按磁盘重新解析上传（S39/S42）：同文件秒传无开销，换文件/换路径则更新稿的 sha1 与 filename。
  // 本地文件不在必须在这里失败——禁止续用 sha1 发新号。
  await uploadAndAnalyze({
    cwd: input.cwd,
    identity,
    file: artifact,
    yes: input.yes,
    apis: input.apis,
  });
  draft = readDraft(input.cwd, identity.n);

  const again = unwrapData(
    await infoApi({
      resourceIdOrName: identity.resourceId,
      isLoadLatestVersionInfo: 1,
    }),
  );
  const currentLatest = String(again.latestVersion ?? latestVersion);
  if (!semver.gt(next, currentLatest)) {
    // i18n: cli.update_version.not_greater
    throw new CliError(
      `线上已经是 ${currentLatest}，不能发 ${next}`,
      'UPDATE_VERSION_NOT_GREATER',
    );
  }

  await submitVersion({
    cwd: input.cwd,
    identity,
    version: next,
    apis: input.apis,
  });
  return next;
}

function resolveNextVersion(latest: string, version?: string, bump?: string): string {
  if (version && bump) {
    // i18n: cli.version.flags_conflict
    throw new CliError('--version 与 --bump 不能一起用', 'VERSION_FLAGS_CONFLICT');
  }
  if (!version && !bump) {
    // i18n: cli.version.need_target
    throw new CliError('请指定 --version 或 --bump', 'VERSION_NEED_TARGET');
  }
  if (version) {
    if (!semver.valid(version)) {
      // i18n: cli.version.invalid
      throw new CliError('版本号无效', 'VERSION_INVALID');
    }
    return version;
  }
  if (bump === 'major' || bump === 'minor' || bump === 'patch') {
    return semver.inc(latest, bump) ?? latest;
  }
  // i18n: cli.version.bump_invalid
  throw new CliError('--bump 只能是 patch、minor 或 major', 'VERSION_BUMP_INVALID');
}
