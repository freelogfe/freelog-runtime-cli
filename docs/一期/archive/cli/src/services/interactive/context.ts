import { tryLoadResourceProject } from '../../config/project.js';
import { requireAuth } from '../../core/auth.js';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { assertOwnerMatch } from '../shared/owner.js';
import { EphemeralStore } from '../store/ephemeralStore.js';
import { projectStoreFromCwd } from '../store/projectStore.js';
import type { ProjectStore } from '../store/types.js';

export interface InteractiveContext {
  mode: 'project' | 'session' | 'studio';
  resourceId?: string;
  resourceTitle?: string;
  store: ProjectStore;
  workspaceRoot?: string;
  activeProjectDir?: string;
}

export function createSessionStore(resourceId?: string): EphemeralStore {
  return new EphemeralStore({
    resourceId: resourceId?.trim() || undefined,
  });
}

export function createSessionContext(resourceId?: string): InteractiveContext {
  return {
    mode: 'session',
    resourceId: resourceId?.trim() || undefined,
    store: createSessionStore(resourceId),
  };
}

export function createProjectInteractiveContext(cwd?: string): InteractiveContext {
  const store = projectStoreFromCwd(cwd);
  const resource = store.loadResource();
  return {
    mode: 'project',
    resourceId: resource.resourceId,
    resourceTitle: resource.resourceTitle,
    store,
    activeProjectDir: store.rootDir(),
  };
}

export function rebindSessionStore(ctx: InteractiveContext, resourceId?: string): void {
  const trimmed = resourceId?.trim() || undefined;
  ctx.store = createSessionStore(trimmed);
  ctx.resourceId = trimmed;
  ctx.resourceTitle = undefined;
}

export function projectStoreForStudioDir(projectDir: string): ProjectStore {
  return projectStoreFromCwd(projectDir);
}

/** studio 维护：子工程 owner 须与当前 ephemeral 登录一致。 */
export function assertStudioOwner(projectDir: string): void {
  const loaded = tryLoadResourceProject(projectDir);
  if (!loaded?.data.resourceId) {
    throw cliError(I18N_KEYS.path_resource_invalid, {
      code: 2,
      hint: '选择含 manifest/state 的有效子工程',
    });
  }
  const auth = requireAuth();
  assertOwnerMatch({
    authUserId: auth.userId,
    authUsername: auth.username,
    platformUserId: loaded.data.userId,
    platformUsername: loaded.data.username,
    hint: '请切换账号（菜单 3）',
  });
}
