import type { BaseUpcastResource, VersionDependency } from '../config/project/types.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { fetchResourceInfo } from './sync/fetch.js';
import { fetchReleasedVersionSnapshot } from './versionPropertyService.js';

/** 会话 dep auth 声明 deps 真源（§22）：resourceVersionInfo1 + fetchResourceInfo.baseUpcast。 */
export async function fetchSessionDeclaredAuthSubjects(opts: {
  resourceId: string;
  version?: string;
}): Promise<{
  dependencies: VersionDependency[];
  baseUpcastResources: BaseUpcastResource[];
  authTreeVersion: string;
}> {
  const info = await fetchResourceInfo(opts.resourceId);
  const authTreeVersion = opts.version?.trim() || info.latestVersion?.trim();
  if (!authTreeVersion) {
    throw cliError(I18N_KEYS.session_dep_auth_no_published_version, {
      code: 4,
      hint: '资源尚无正式版；请传 --version 或先 publish',
    });
  }

  const snapshot = await fetchReleasedVersionSnapshot({
    resourceId: opts.resourceId,
    version: authTreeVersion,
  });

  return {
    dependencies: snapshot.dependencies ?? [],
    baseUpcastResources: (info.baseUpcastResources ?? []).map((item) => ({
      resourceId: item.resourceId,
      resourceName: item.resourceName,
    })),
    authTreeVersion,
  };
}
