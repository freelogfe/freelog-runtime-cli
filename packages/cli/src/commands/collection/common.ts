export const collectionCommonArgs = {
  cwd: { type: 'string' as const },
  'no-auto-pull': { type: 'boolean' as const },
  yes: { type: 'boolean' as const, alias: 'y' as const },
  test: { type: 'boolean' as const },
  env: { type: 'string' as const, description: '运行环境：production/prod/test/dev' },
  json: { type: 'boolean' as const },
  debug: { type: 'boolean' as const, description: '打印脱敏调试信息' },
};

export const collectionEnvArgs = {
  cwd: { type: 'string' as const },
  test: { type: 'boolean' as const },
  env: { type: 'string' as const, description: '运行环境：production/prod/test/dev' },
  json: { type: 'boolean' as const },
  debug: { type: 'boolean' as const, description: '打印脱敏调试信息' },
};
