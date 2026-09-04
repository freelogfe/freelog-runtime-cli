import path from 'node:path';
import { cliError } from '../../i18n/cliError.js';
import { I18N_KEYS } from '../../i18n/bundled.js';
import { createProjectStore, projectStoreFromCwd } from './projectStore.js';
import type { ProjectStore, ProjectStoreFactoryOpts } from './types.js';

export interface CommandStoreArgs {
  cwd?: string;
  session?: boolean;
  'resource-id'?: string;
  seed?: ProjectStoreFactoryOpts['seed'];
}

export function resolveCommandProjectStore(args: CommandStoreArgs): ProjectStore {
  if (args.session) {
    return createProjectStore({
      cwd: args.cwd,
      session: true,
      resourceId: args['resource-id'],
      seed: args.seed,
    });
  }
  return projectStoreFromCwd(args.cwd);
}

export function assertSessionMode(args: { session?: boolean }, hint?: string): void {
  if (!args.session) {
    throw cliError(I18N_KEYS.session_flag_required, {
      code: 4,
      hint: hint ?? '维护/发版请使用 --session，工程目录请用顶层 publish/update',
    });
  }
}

export function assertSessionResourceId(resourceId?: string): void {
  if (!resourceId?.trim()) {
    throw cliError(I18N_KEYS.session_resource_id_required, { code: 4 });
  }
}

/** 会话维护类命令 Store（policy/online 等 §20.6）。 */
export function resolveSessionMaintenanceStore(
  args: CommandStoreArgs & { session?: boolean },
): ProjectStore {
  if (!args.session) {
    return projectStoreFromCwd(args.cwd);
  }
  assertSessionMode(args);
  assertSessionResourceId(args['resource-id']);
  return resolveCommandProjectStore({
    cwd: args.cwd,
    session: true,
    'resource-id': args['resource-id'],
  });
}

/** 会话命令成功收尾：可选 --export-project 落盘 + JSON 字段（§7.4 / §9）。 */
export function finalizeSessionCommand(opts: {
  store: ProjectStore;
  exportProject?: string;
  result: Record<string, unknown>;
}): Record<string, unknown> {
  if (opts.store.mode() !== 'session') return opts.result;

  let exportPath: string | null = null;
  let persisted = false;
  if (opts.exportProject?.trim()) {
    exportPath = opts.store.exportProject(path.resolve(opts.exportProject.trim()));
    persisted = true;
  }

  return {
    ...opts.result,
    mode: 'session',
    persisted,
    exportProject: exportPath,
  };
}
