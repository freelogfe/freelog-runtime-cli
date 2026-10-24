/** Design-derived local command leaves. This slice does not satisfy the parent command matrix. */
const design = 'docs/一期/产品方案/脚手架设计';
export const logoutSelectorContents = Object.freeze({
  workspace: 'SYNTHETIC_SELECTOR_MUST_NOT_BE_READ\n',
  global: 'SYNTHETIC_GLOBAL_MUST_NOT_BE_READ\n',
  legacy: '{"token":"synthetic-legacy-only","iv":"synthetic-iv"}\n',
});
const commonAssertions = Object.freeze(['command-input', 'normal-rejection', 'exact-error-json', 'stderr-empty', 'local-unchanged', 'network-unused']);
const prerequisites = Object.freeze([
  'Execute the fixed installed FREELOG_TEST_CLI_BIN with ordinary non-TTY stdin; never build or use workspace dist.',
  'Create a new owned temporary project with one valid unbound resource identity, an existing artifact and a sentinel empty directory.',
  'No credentials, pending operation or transaction exists. A deliberately invalid non-secret .freelog/auth sentinel blocks ancestor/global credential inheritance; each command must reject before reading it. Use an isolated HOME/USERPROFILE.',
  'Load the deny-network preload before the installed CLI; require its ready/finished record and zero attempts.',
]);
const forbidden = Object.freeze(['remote request or socket attempt', 'credential lookup or mutation', 'persistent local file or directory changes']);

const leaves = [
  ...[
    ['NEAREST', 'nearest', [], 'work', 'project/.freelog/auth'],
    ['GLOBAL', 'global', ['--global'], 'home', '.freelog/auth-default.json'],
    ['FALLBACK', 'fallback', [], 'home', '.freelog/auth-default.json'],
    ['NONE', 'none', [], null, null],
    ['GLOBAL_MISSING', 'global-missing', ['--global'], null, null],
    ['LEGACY', 'legacy', [], 'work', 'project/.freelog/auth'],
    ['CWD', 'cwd', ['--cwd', 'project/nested/deep'], 'work', 'project/.freelog/auth'],
  ].map(([suffix, fixture, flags, root, removed]) => ({
    id: `COMMAND.PARAMETER.LOGOUT_${suffix}`, title: `Logout selector boundary: ${fixture}`,
    inputClass: `non-TTY logout; ${fixture}`, logout: Object.freeze({ fixture, root, removed }),
    args: ['logout', ...flags, '--env', 'dev', '--json'],
    designs: [{ path: `${design}/ARCHITECTURE/01-账号.md`, section: '1. 用户可见命令 / 2.2 非秘密选择器 / 5. 禁止' }],
    error: removed ? undefined : { code: 'LOGOUT_NOTHING', message: fixture === 'global-missing' ? '没有可删除的全局凭据' : '没有可删除的凭据' },
    mapping: { path: 'packages/cli/src/commands/account/logout.ts', symbol: 'createLogoutCommand' },
  })),
  ...[
    ['YES_FIELDS_REQUIRED', ['--yes'], 'LOGIN_YES_FLAGS', '--yes 登录必须同时提供 --login-name 与 --password-stdin'],
    ['YES_NAME_REQUIRED', ['--password-stdin', '--yes'], 'LOGIN_YES_FLAGS', '--yes 登录必须同时提供 --login-name 与 --password-stdin'],
    ['YES_STDIN_REQUIRED', ['--login-name', 'synthetic-user', '--yes'], 'LOGIN_YES_FLAGS', '--yes 登录必须同时提供 --login-name 与 --password-stdin'],
    ['NON_TTY_FIELDS_REQUIRED', [], 'LOGIN_NON_TTY_FLAGS', '非交互登录请使用 --login-name --password-stdin --yes'],
    ['NON_TTY_NAME_REQUIRED', ['--password-stdin'], 'LOGIN_NON_TTY_FLAGS', '非交互登录请使用 --login-name --password-stdin --yes'],
    ['NON_TTY_STDIN_REQUIRED', ['--login-name', 'synthetic-user'], 'LOGIN_NON_TTY_FLAGS', '非交互登录请使用 --login-name --password-stdin --yes'],
  ].map(([suffix, flags, code, message]) => ({
    id: `COMMAND.PARAMETER.LOGIN_${suffix}`, title: `Incomplete non-TTY login: ${suffix}`,
    inputClass: `ordinary non-TTY stdin; ${suffix}`,
    args: ['login', ...flags, '--env', 'dev', '--json'],
    designs: [{ path: `${design}/ARCHITECTURE/01-账号.md`, section: '1. 用户可见命令' }],
    error: { code, message },
    mapping: { path: 'packages/cli/src/commands/account/login.ts', symbol: 'createLoginCommand' },
  })),
  {
    id: 'COMMAND.PARAMETER.ENV_STAGING_REJECTED', title: 'Unknown staging environment fails before any request or local mutation',
    inputClass: 'unknown environment token: staging', args: ['status', '--env', 'staging', '--yes', '--json'],
    designs: [{ path: `${design}/ARCHITECTURE/07-环境.md`, section: '1. 三个环境' }],
    error: { code: 'ENV_INVALID', message: '环境只能是 prod、test 或 dev' },
    mapping: { path: 'packages/cli/src/domain/env.ts', symbol: 'normalizeEnvToken' },
  },
  {
    id: 'COMMAND.PARAMETER.ENV_LOCAL_REJECTED', title: 'Unknown local environment fails before any request or local mutation',
    inputClass: 'unknown environment token: local', args: ['status', '--env', 'local', '--yes', '--json'],
    designs: [{ path: `${design}/ARCHITECTURE/07-环境.md`, section: '1. 三个环境' }],
    error: { code: 'ENV_INVALID', message: '环境只能是 prod、test 或 dev' },
    mapping: { path: 'packages/cli/src/domain/env.ts', symbol: 'normalizeEnvToken' },
  },
  {
    id: 'COMMAND.PARAMETER.SHOW_LOCAL_VERSION_CONFLICT', title: 'Local draft view cannot be combined with a published version number',
    inputClass: 'mutually exclusive local/published view flags',
    args: ['version', 'show', '--local', '--version', '1.0.0', '--env', 'dev', '--yes', '--json'],
    designs: [
      { path: `${design}/COMMANDS.md`, section: '3.1 看（不写盘）' },
      { path: `${design}/PHASE/单资源/管理/01-版本信息.md`, section: '版本信息' },
    ],
    error: { code: 'SHOW_LOCAL_CONFLICT', message: '--local 不能与 --version 一起用' },
    mapping: { path: 'packages/cli/src/commands/version/show.ts', symbol: 'createVersionShowCommand' },
  },
  {
    id: 'COMMAND.PARAMETER.POLICY_DIRECTION_CONFLICT', title: 'Policy direction must not request on and off together',
    inputClass: 'two mutually exclusive policy directions',
    args: ['policy', 'set', '--id', 'test', '--on', '--off', '--env', 'dev', '--yes', '--json'],
    designs: [{ path: `${design}/COMMANDS.md`, section: '4. listing · 策略 · 上下架' }],
    error: { code: 'POLICY_SET_DIRECTION', message: '必须且只能提供 --on 或 --off' },
    mapping: { path: 'packages/cli/src/commands/policy/set.ts', symbol: 'createPolicySetCommand' },
  },
  {
    id: 'COMMAND.PARAMETER.POLICY_DIRECTION_REQUIRED', title: 'Policy direction must be explicit even with yes',
    inputClass: 'missing policy direction with explicit id and yes',
    args: ['policy', 'set', '--id', 'test', '--env', 'dev', '--yes', '--json'],
    designs: [{ path: `${design}/COMMANDS.md`, section: '4. listing · 策略 · 上下架' }],
    error: { code: 'POLICY_SET_DIRECTION', message: '必须且只能提供 --on 或 --off' },
    mapping: { path: 'packages/cli/src/commands/policy/set.ts', symbol: 'createPolicySetCommand' },
  },
];

export const commandParameterCases = Object.freeze(leaves.map(({ error, mapping, args, designs, ...leaf }) => Object.freeze({
  ...leaf, parentRule: 'COMMAND.PARAMETER_CONTRACT', kind: 'product-case', required: true,
  script: 'verify-command-parameters.mjs', layer: 'installed-package/local-no-network',
  assertionIds: leaf.logout ? Object.freeze(['command-input', 'normal-exit', 'exact-output', 'stderr-empty', 'workspace-state', 'home-state', 'network-unused', 'logout-guard']) : commonAssertions,
  preconditions: leaf.logout ? Object.freeze([
    'Execute the installed bin in an owned temporary workspace and HOME with the fixed logout fixture; ordinary non-TTY stdin.',
    'Replace native keyring before CLI loading; guard its current string-path readFileSync/unlinkSync calls and retain events. Not a general filesystem sandbox.',
    'Keep resource and collection identities/drafts, ancestor and sibling selectors as applicable. No real credentials or platform requests.',
  ]) : prerequisites,
  forbiddenSideEffects: leaf.logout ? Object.freeze(['network access', 'native credential operations', 'selector-content reads', 'any change other than the exact selected selector removal']) : forbidden,
  action: Object.freeze({ argv: Object.freeze(args), stdin: '' }),
  designRefs: Object.freeze([...designs, { path: `${design}/ARCHITECTURE/08-多资源本地状态、选择与产物路径.md`, section: '3. 命令路由与选择规则 / 5. 实现与验证边界' }].map(Object.freeze)),
  // Rejection semantics come from the design. Exact code/message is the existing technical
  // error mapping plus core/errors.ts, not a new universal parser/JSON product promise.
  technicalMapping: Object.freeze({ ...mapping, errorOutlet: 'packages/cli/src/core/errors.ts#formatCliError' }),
  expected: Object.freeze({ exitCode: leaf.logout?.removed ? 0 : 1, ...(error ? { errorJson: Object.freeze(error) } : {}),
    stderr: '', networkAttempts: 0, localChanges: Object.freeze(leaf.logout?.removed
      ? [Object.freeze({ operation: 'unlink', root: leaf.logout.root, path: leaf.logout.removed })] : []) }),
})));

/** Follow-up inputs only; none is silently included in or satisfied by these rejection leaves. */
export const deferredCommandParameterClasses = Object.freeze([
  Object.freeze({ inputClass: 'update-version target/version/bump conflicts and missing/invalid target',
    reason: 'Current command reaches requireAuth and Resource.info before resolveNextVersion; needs isolated real-dev evidence or a separately authorized ordering fix.' }),
  Object.freeze({ inputClass: 'unknown legacy flags and missing required positional/option values',
    reason: 'Commander uses its separate stderr parser channel; this slice covers only complete-JSON rejection leaves.' }),
  Object.freeze({ inputClass: 'valid flags, environment aliases/precedence and resource-selection equivalence classes',
    reason: 'Require their own design-derived local/remote preconditions and producers; no accepted-input or full matrix claim is made here.' }),
]);
