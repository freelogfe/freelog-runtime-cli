import { getConsoleBaseURL, type FreelogEnv } from './env.js';

export type ConsoleResourceKind = 'resource' | 'collection';

export interface ConsoleHandoff {
  reason: string;
  actionUrl: string;
  contractsUrl: string;
  nextCommand: string;
}

function consoleRoute(kind: ConsoleResourceKind, page: 'dependency' | 'contract'): string {
  return kind === 'collection'
    ? `/resource/collectionSidebar/${page}`
    : `/resource/sidebar/${page}`;
}

/** 与 Console tools-lib/linkTo.ts 的资源、合集侧边栏路由保持一致。 */
export function buildConsoleResourceUrls(opts: {
  id: string;
  kind?: ConsoleResourceKind;
  env?: FreelogEnv;
}): { actionUrl: string; contractsUrl: string } {
  const kind = opts.kind ?? 'resource';
  const encodedId = encodeURIComponent(opts.id);
  const base = getConsoleBaseURL(opts.env);
  return {
    actionUrl: `${base}${consoleRoute(kind, 'dependency')}/${encodedId}`,
    contractsUrl: `${base}${consoleRoute(kind, 'contract')}/${encodedId}`,
  };
}

export function buildConsoleHandoff(opts: {
  id: string;
  reason: string;
  nextCommand: string;
  kind?: ConsoleResourceKind;
  env?: FreelogEnv;
}): ConsoleHandoff {
  return {
    reason: opts.reason,
    ...buildConsoleResourceUrls(opts),
    nextCommand: opts.nextCommand,
  };
}
