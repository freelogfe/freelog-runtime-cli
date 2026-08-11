import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../..');
const explicitRoot = process.argv.find((arg) => arg.startsWith('--console-root='))?.split('=')[1];
const consoleRoot = path.resolve(
  explicitRoot ||
    process.env.FREELOG_CONSOLE_ROOT ||
    path.join(repoRoot, '..', 'freelogfe-web-repos', 'packages', 'console'),
);
const consoleRepoRoot = path.resolve(consoleRoot, '../..');
const sourceRoot = path.join(consoleRoot, 'src');
const contractFile = path.join(
  repoRoot,
  'docs',
  '新方案',
  '对齐',
  'Console表单字段与交互规则.md',
);

function fail(message) {
  process.stderr.write(`FAIL ${message}\n`);
  process.exitCode = 1;
}

function read(relativePath) {
  const file = path.join(sourceRoot, relativePath);
  if (!fs.existsSync(file)) {
    fail(`Console source missing: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

if (!fs.existsSync(sourceRoot)) {
  throw new Error(
    `Console source not found: ${sourceRoot}. Set FREELOG_CONSOLE_ROOT or pass --console-root=<packages/console>.`,
  );
}

const contract = fs.readFileSync(contractFile, 'utf8');
const expectedCommit = contract.match(/Console commit `([0-9a-f]{40})`/)?.[1];
const actualCommit = execFileSync('git', ['-C', consoleRepoRoot, 'rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
if (!expectedCommit || expectedCommit !== actualCommit) {
  fail(`Console commit drift: contract=${expectedCommit || 'missing'} actual=${actualCommit}`);
}

const dirty = execFileSync(
  'git',
  ['-C', consoleRepoRoot, 'status', '--porcelain', '--', 'packages/console'],
  { encoding: 'utf8' },
).trim();
if (dirty) fail('Console packages/console has uncommitted changes; snapshot evidence is not reproducible');

const checks = [
  {
    id: 'FORM-RES-TYPE',
    file: 'models/resourceCreatorPage/step1Effects.ts',
    patterns: [/naming_convention_resource_type_required/],
  },
  {
    id: 'FORM-RES-TITLE',
    file: 'pages/resource/creator/Step1/index.tsx',
    patterns: [/lengthLimit=\{100\}/],
  },
  {
    id: 'FORM-RES-NAME',
    file: 'pages/resource/creator/Step1/index.tsx',
    patterns: [/lengthLimit=\{60\}/],
  },
  {
    id: 'FORM-LIST-INTRO:create',
    file: 'pages/resource/creator/Step4/index.tsx',
    patterns: [/lengthLimit=\{200\}/],
  },
  {
    id: 'FORM-LIST-INTRO:collection',
    file: 'pages/resource/collectionCreator/Step4/index.tsx',
    patterns: [/lengthLimit=\{200\}/],
  },
  {
    id: 'FORM-LIST-INTRO:sidebar',
    file: 'components/FIntroductionInput/index.tsx',
    patterns: [/lengthLimit = 200/, /\$value\.length > lengthLimit/],
  },
  {
    id: 'FORM-LIST-TAGS',
    file: 'components/FLabelEditor/index.tsx',
    patterns: [/values\?\.length < 20/, /value\.length > 20/, /values\.includes\(value\)/],
  },
  {
    id: 'FORM-POL-NAME',
    file: 'components/fPolicyBuilder3/FPolicyBuilderDrawer3/index.tsx',
    patterns: [/lengthLimit=\{20\}/, /value\.length < 2/, /策略名称已存在/, /请输入策略名称/],
  },
  {
    id: 'FORM-POL-TEXT',
    file: 'components/fPolicyBuilder3/FPolicyBuilderDrawer3/index.tsx',
    patterns: [/alreadyUsedTexts\.includes\(policyCode\)/, /策略代码已存在/],
  },
  {
    id: 'FORM-VER-NUMBER',
    file: 'models/resourceVersionCreatorPage.ts',
    patterns: [/semver\.inc\(data_resourceInfo\.latestVersion, 'patch'\)/],
  },
  {
    id: 'FORM-VER-DRAFT',
    file: 'models/resourceVersionCreatorPage.ts',
    patterns: [/FServiceAPI\.Resource\.lookDraft/, /FServiceAPI\.Resource\.saveVersionsDraft/],
  },
  {
    id: 'FORM-ONLINE',
    file: 'pages/resource/sidebar/Sider/index.tsx',
    patterns: [
      /msg_release_version_first/,
      /msg_set_resource_avaliable_for_auth01/,
      /msg_set_resource_avaliable_for_auth02/,
    ],
  },
  {
    id: 'FORM-COL-TITLE',
    file: 'components/FCollectionItems2/CollectionList/index.tsx',
    patterns: [/lengthLimit=\{100\}/],
  },
  {
    id: 'FORM-COL-ADD',
    file: 'components/FAddResourcesHandleAuth/index.tsx',
    patterns: [/resourceIDs\.slice\(0, 100\)/],
  },
  {
    id: 'FORM-COL-DISPLAY',
    file: 'models/collectionManager/types.ts',
    patterns: [
      /collection_sort_ascending/,
      /collection_sort_descending/,
      /collection_view_list/,
      /collection_view_card/,
      /collection_item_no_display_hide/,
    ],
  },
  {
    id: 'FORM-LIST-COVER',
    file: 'components/FUploadCover/index.tsx',
    patterns: [/file\.size > 5 \* 1024 \* 1024/, /limit_resource_image_size/],
  },
  {
    id: 'FORM-BATCH-COUNT',
    file: 'pages/resource/creatorBatch/Handle/index.tsx',
    patterns: [/dataSource\.length > 20/, /dataSource = dataSource\.slice\(0, 20\)/],
  },
  {
    id: 'FORM-VER-SIZE',
    file: 'pages/resource/creatorBatch/Handle/Task/index.tsx',
    patterns: [/文件大小不能超过1GB/, /文件大小不能超过200MB/],
  },
  {
    id: 'FORM-COL-RULES',
    file: 'pages/resource/collectionSidebar/info/$id/index.tsx',
    patterns: [
      /serializeStatus: get\$setting\(\)\.isFinish \? 1 : 0/,
      /conditionType: get\$setting\(\)\.conditionType === 'every' \? 1 : 2/,
      /v\.value === 'EQUAL'/,
      /lengthLimit=\{100\}/,
      /lengthLimit=\{60\}/,
      /username \+ '\/' \+ c\.value/,
    ],
  },
  {
    id: 'FORM-COL-RSS',
    file: 'components/FPodcastRssSubmit/Flow/index.tsx',
    patterns: [
      /PODCAST_RSS_EPISODE_LIMIT/,
      /FServiceAPI\.Rss\.bindingsCompare/,
      /Math\.max\(N, M\) - matched > Math\.abs\(M - N\)/,
      /新的 RSS 订阅地址不能与原先的地址相同/,
      /set\$sentCaptchaWait\(60\)/,
    ],
  },
  {
    id: 'FORM-COL-RSS-LOCK',
    file: 'pages/resource/collectionSidebar/info/$id/index.tsx',
    patterns: [
      /除标签外的模块禁止编辑/,
      /disabled=\{isRssCollection\}/,
      /rssSource === 'yes'/,
    ],
  },
];

let passed = 0;
for (const check of checks) {
  const source = read(check.file);
  const missing = check.patterns.filter((pattern) => !pattern.test(source));
  if (missing.length) {
    fail(`${check.id} drifted in ${check.file}: missing ${missing.join(', ')}`);
  } else {
    passed += 1;
    process.stdout.write(`PASS ${check.id} ${check.file}\n`);
  }
}

if (!process.exitCode) {
  process.stdout.write(`PASS Console form contract ${passed}/${checks.length}, commit ${actualCommit}\n`);
}
