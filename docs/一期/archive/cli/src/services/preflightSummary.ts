import { consola } from 'consola';
import { resolveCwd } from '../config/project.js';
import { I18N_KEYS, t } from '../i18n/index.js';
import type { PlatformResourceInfo } from './sync/index.js';
import { evaluateOnlineGates } from './onlineGates.js';
import { validateProject } from './validateService.js';

export interface OnlineGatesSummary {
  gates: ReturnType<typeof evaluateOnlineGates>;
  lines: string[];
  failureKey?: string;
}

/** 上架门禁人类可读摘要 + 失败时将用的 i18n key（三分支顺序与 Console 一致） */
export function summarizeOnlineGates(info: PlatformResourceInfo): OnlineGatesSummary {
  const gates = evaluateOnlineGates(info);
  const lines = [
    `上架预检：latestVersion=${info.latestVersion || '（无）'}；启用策略=${gates.enabledPolicyCount} 个`,
  ];
  if (!gates.ok) {
    if (!gates.hasLatestVersion) {
      lines.push(t(I18N_KEYS.msg_release_version_first));
    } else if ((info.policies || []).length === 0) {
      lines.push(t(I18N_KEYS.msg_set_resource_avaliable_for_auth01));
    } else {
      lines.push(t(I18N_KEYS.msg_set_resource_avaliable_for_auth02));
    }
  } else {
    lines.push('门禁检查通过，可执行上架');
  }

  let failureKey: string | undefined;
  if (!gates.ok) {
    if (!gates.hasLatestVersion) failureKey = I18N_KEYS.msg_release_version_first;
    else if ((info.policies || []).length === 0) {
      failureKey = I18N_KEYS.msg_set_resource_avaliable_for_auth01;
    } else failureKey = I18N_KEYS.msg_set_resource_avaliable_for_auth02;
  }

  return { gates, lines, failureKey };
}

/** 发行/草稿 preflight（warn 级及以上） */
export async function summarizePublishPreflight(opts: {
  cwd?: string;
}): Promise<string[]> {
  const result = await validateProject({ cwd: resolveCwd(opts.cwd), target: 'publish' });
  const lines = [`发行预检（${result.checks.length} 项）`];
  for (const check of result.checks) {
    if (check.level === 'ok') continue;
    const prefix = check.level === 'error' ? '✗' : '⚠';
    lines.push(`${prefix} ${check.message}${check.hint ? `（${check.hint}）` : ''}`);
  }
  if (result.ok) lines.push('预检通过');
  return lines;
}

export function printPreflightLines(lines: string[]): void {
  for (const line of lines) consola.info(line);
}
