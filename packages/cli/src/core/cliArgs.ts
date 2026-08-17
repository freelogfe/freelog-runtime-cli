/** citty 参数描述真源：与 CLI使用说明 §1 全局参数一致 */

export const cliEnvArgs = {
  test: { type: 'boolean' as const, description: '等价 --env test' },
  env: {
    type: 'string' as const,
    description: '运行环境：dev/test（production/prod 暂未开放；未指定时会被阻断）',
  },
};

export const cliOutputArgs = {
  json: { type: 'boolean' as const, description: 'JSON envelope 输出（含 code/message/hint/details）' },
  debug: { type: 'boolean' as const, description: '脱敏调试信息（或环境变量 FREELOG_DEBUG=1）' },
  lang: { type: 'string' as const, description: '当次语言：zh_CN | en_US' },
};

export const cliJsonLinesArg = {
  'json-lines': {
    type: 'boolean' as const,
    description: '逐行输出 NDJSON 进度（start/ok/fail/skip/done），便于 CI 解析',
  },
};

export const cliConfirmArgs = {
  yes: { type: 'boolean' as const, alias: 'y' as const, description: '非交互确认' },
};

export const cliCwdArg = {
  cwd: { type: 'string' as const, description: '项目目录（凭据自该目录向上解析）' },
};

export const cliNoAutoPullArg = {
  'no-auto-pull': {
    type: 'boolean' as const,
    description: '写命令前不自动 pull；listing 与平台不一致时直接失败',
  },
};

export const cliSessionStoreArgs = {
  session: {
    type: 'boolean' as const,
    description: '会话模式（EphemeralStore，不写 manifest）',
  },
  'resource-id': {
    type: 'string' as const,
    description: '平台 resourceId（维护/发新版必填；首发 create 除外）',
  },
  'export-project': {
    type: 'string' as const,
    description: '会话成功后导出工程目录（见 --export-project 规格）',
  },
};

export const cliReuseArgs = {
  'reuse-version': {
    type: 'string' as const,
    description: '从已发版继承 fileSha1/filename（与 --file 互斥）',
  },
  'no-inherit-deps': {
    type: 'boolean' as const,
    description: 'reuse 时不继承平台 dependencies',
  },
};

export const cliSessionArgs = {
  ...cliSessionStoreArgs,
  ...cliReuseArgs,
};

/** 写 manifest 意图但不须 --yes 的命令（dep add 等） */
export const cliSyncWriteArgs = {
  ...cliCwdArg,
  ...cliNoAutoPullArg,
  ...cliEnvArgs,
  json: cliOutputArgs.json,
  debug: cliOutputArgs.debug,
  ...cliSessionStoreArgs,
};

/** 多数写命令（publish、update、dep auth、version、合集写操作等） */
export const cliWriteCommandArgs = {
  ...cliSyncWriteArgs,
  ...cliConfirmArgs,
  ...cliReuseArgs,
};

/** 只读命令（pull、status、type、validate 等） */
export const cliReadCommandArgs = {
  ...cliCwdArg,
  ...cliEnvArgs,
  json: cliOutputArgs.json,
  debug: cliOutputArgs.debug,
};

/** 根命令 freelog-cli --help 的全局 OPTIONS */
export const mainGlobalArgs = {
  ...cliEnvArgs,
  ...cliOutputArgs,
  ...cliConfirmArgs,
  ...cliCwdArg,
  ...cliNoAutoPullArg,
  ...cliSessionArgs,
};
