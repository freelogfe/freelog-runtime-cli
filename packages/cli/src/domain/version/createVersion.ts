import { CliError } from '../../core/errors';
import { deleteDraft, emptyDraft, readDraft, writeDraft } from '../../local/draft';
import { FServiceAPI } from '../../platform/api';
import { requireAuth } from '../account/login';
import { assertPlatformAllowed } from '../env';
import { evaluateGates, resolveBoundIdentity } from './gates';
import { submitVersion, type SubmitApis } from './submit';
import { uploadAndAnalyze, type FileApis } from './file';
import { unwrapData } from '../../platform/unwrap';

export type CreateVersionApis = SubmitApis & FileApis & {
  info?: (params: Record<string, unknown>) => Promise<unknown>;
};



export async function runCreateVersion(input: {
  cwd: string;
  file?: string;
  prepare?: boolean;
  reset?: boolean;
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
  if (input.reset) {
    deleteDraft(input.cwd, identity.n);
  }
  const draft = readDraft(input.cwd, identity.n);
  evaluateGates({ latestVersion, draft }, 'create-version');

  if (!draft || input.prepare) {
    writeDraft(input.cwd, identity.n, draft ?? emptyDraft());
    if (identity.filePath || input.file) {
      await uploadAndAnalyze({
        cwd: input.cwd,
        identity,
        file: input.file,
        yes: input.yes,
        apis: input.apis,
      });
    }
  }

  if (input.prepare) {
    return '已备稿，未提交';
  }
  if (!input.yes) {
    // i18n: cli.create_version.need_yes
    throw new CliError('提交请加 --yes', 'CREATE_VERSION_NEED_YES');
  }

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
