import { defineCommand, parseArgs } from 'citty';
import { consola } from 'consola';
import { applyWriteCommandFlags, handleCommandError, writeJsonSuccess } from '../core/command.js';
import { cliWriteCommandArgs } from '../core/cliArgs.js';
import { isInteractive } from '../core/tty.js';
import { resolveCwd } from '../config/project.js';
import { runInitScaffold, resolveInitOutcome, initNextSteps, type InitScaffold, type ScaffoldPreset } from '../services/init/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

type InitArgs = {
  dir?: string;
  scaffold?: string;
  template?: string;
  runtime?: string;
  'resource-type'?: string;
  'resource-type-name'?: string;
  'resource-name'?: string;
  title?: string;
  namespace?: string;
  'templates-dir'?: string;
  pm?: string;
  'skip-install'?: boolean;
  'artifact-mode'?: string;
  cwd?: string;
  yes?: boolean;
  json?: boolean;
  test?: boolean;
  env?: string;
  debug?: boolean;
};

const SCAFFOLD_PRESET_META: Record<
  ScaffoldPreset,
  { label: string; description: string }
> = {
  theme: {
    label: '主题',
    description: '创建主题工程（从平台类型树定稿「主题」，选 runtime 模板，不问类型树）',
  },
  widget: {
    label: '插件',
    description: '创建插件工程（从平台类型树定稿「插件」，选 runtime 模板，不问类型树）',
  },
  package: {
    label: '前端库',
    description: '创建前端库/软件库工程（从平台类型树定稿类型，选 package 模板 + namespace）',
  },
};

const sharedInitArgs = {
  dir: {
    type: 'positional' as const,
    description: '项目目录名；传 . 表示当前目录',
    required: true,
  },
  template: { type: 'string' as const, description: '模板 id，如 vite-vue-ts' },
  runtime: { type: 'string' as const, description: '0.4 | 0.5（theme/widget）' },
  'resource-type': {
    type: 'string' as const,
    description: '覆盖默认定稿类型（一般不需要）',
  },
  'resource-type-name': { type: 'string' as const, description: '自定义资源类型名（可选）' },
  'resource-name': { type: 'string' as const, description: '资源短授权标识；默认目录名' },
  title: { type: 'string' as const, description: '资源标题' },
  namespace: { type: 'string' as const, description: '前端库命名空间（package 必填）' },
  'templates-dir': { type: 'string' as const, description: '本地 templates 根目录' },
  pm: { type: 'string' as const, description: 'pnpm | npm | yarn' },
  'skip-install': { type: 'boolean' as const, description: '跳过依赖安装' },
  'artifact-mode': {
    type: 'string' as const,
    description: '本地产物形态：file | directory-zip（scaffold none 可用）',
  },
  ...cliWriteCommandArgs,
};

async function runInitCommand(args: InitArgs, presetCategory?: ScaffoldPreset): Promise<void> {
  applyWriteCommandFlags(args);
  let scaffold = args.scaffold as InitScaffold | undefined;
  if (scaffold && !['runtime', 'package', 'none', 'collection'].includes(scaffold)) {
    throw cliError(I18N_KEYS.invalid_scaffold, { code: 4 });
  }
  let runtime: '0.4' | '0.5' | undefined;
  if (args.runtime) {
    if (args.runtime !== '0.4' && args.runtime !== '0.5') {
      throw cliError(I18N_KEYS.runtime_only_04_05, { code: 4 });
    }
    runtime = args.runtime;
  }
  let pm: 'pnpm' | 'npm' | 'yarn' | undefined;
  if (args.pm) {
    if (!['pnpm', 'npm', 'yarn'].includes(args.pm)) {
      throw cliError(I18N_KEYS.pm_only_pnpm_npm_yarn, { code: 4 });
    }
    pm = args.pm as 'pnpm' | 'npm' | 'yarn';
  }
  let artifactMode: 'file' | 'directory-zip' | undefined;
  if (args['artifact-mode'] !== undefined) {
    if (args['artifact-mode'] !== 'file' && args['artifact-mode'] !== 'directory-zip') {
      throw cliError(I18N_KEYS.artifact_mode_invalid, { code: 4 });
    }
    artifactMode = args['artifact-mode'];
  }

  const cwd = resolveCwd(args.cwd);
  const { args: resolved, dir } = await resolveInitOutcome({
    yes: Boolean(args.yes),
    scaffold,
    resourceTypeCode: args['resource-type'],
    presetCategory,
    template: args.template,
    runtime,
    namespace: args.namespace,
    resourceName: args['resource-name'],
    title: args.title,
    dir: String(args.dir),
    cwd,
  });

  scaffold = resolved.scaffold;
  runtime = resolved.runtime;
  if (
    scaffold === 'none' &&
    !artifactMode &&
    !isInteractive(Boolean(args.yes))
  ) {
    throw cliError(I18N_KEYS.artifact_mode_invalid, {
      code: 4,
      details: { reason: 'missing', filePath: resolved.versionFilePath },
      hint: '本地目录或文件的打包方式不能猜测；请显式传 --artifact-mode file 或 --artifact-mode directory-zip',
    });
  }

  const result = await runInitScaffold({
    dir,
    cwd,
    scaffold,
    template: resolved.template,
    runtime,
    resourceTypeCode: resolved.resourceTypeCode,
    resourceTypeName: resolved.resourceTypeName || args['resource-type-name'],
    resourceTypeLabels: resolved.resourceTypeLabels,
    resourceName: resolved.resourceName || args['resource-name'],
    title: resolved.title || args.title,
    namespace: resolved.namespace,
    versionFilePath: resolved.versionFilePath,
    artifactMode,
    templatesDir: args['templates-dir'],
    pm,
    skipInstall: Boolean(args['skip-install']),
    overwrite: Boolean(args.yes),
  });

  if (args.json) {
    writeJsonSuccess('init', {
      mode: presetCategory ? `scaffold_${presetCategory}` : 'scaffold',
      projectDir: result.projectDir,
      cliVersion: result.compat?.cliVersion,
      resourceTypeCode: resolved.resourceTypeCode,
      scaffold,
      category: resolved.category,
    });
  } else {
    consola.success(`已创建 ${result.projectDir}`);
    if (presetCategory) {
      consola.info(
        `脚手架: ${SCAFFOLD_PRESET_META[presetCategory].label} · resourceTypeCode=${resolved.resourceTypeCode} · scaffold=${scaffold}`,
      );
    } else {
      consola.info(
        `资源类型: ${resolved.resourceTypeCode} · 大类: ${resolved.category} · scaffold=${scaffold}`,
      );
    }
    consola.info('下一步:');
    for (const line of initNextSteps({
      scaffold,
      category: resolved.category,
      projectDir: result.projectDir,
    })) {
      consola.info(`  ${line}`);
    }
  }
}

const SCAFFOLD_PRESET_NAMES = ['theme', 'widget', 'package'] as const;

function isScaffoldPreset(name: string): name is ScaffoldPreset {
  return (SCAFFOLD_PRESET_NAMES as readonly string[]).includes(name);
}

/** citty 子命令会把首个 positional 当子命令名，与 `init <dir>` 冲突；改用手动路由 preset。 */
function resolveInitRawArgs(rawArgs: string[]): {
  preset?: ScaffoldPreset;
  stripped: string[];
} {
  const firstIdx = rawArgs.findIndex((arg) => !arg.startsWith('-'));
  if (firstIdx >= 0 && isScaffoldPreset(rawArgs[firstIdx])) {
    return {
      preset: rawArgs[firstIdx] as ScaffoldPreset,
      stripped: [...rawArgs.slice(0, firstIdx), ...rawArgs.slice(firstIdx + 1)],
    };
  }
  return { stripped: rawArgs };
}

const initCommandArgs = {
  dir: sharedInitArgs.dir,
  scaffold: {
    type: 'string' as const,
    description: 'runtime | package | none | collection',
  },
  template: sharedInitArgs.template,
  runtime: sharedInitArgs.runtime,
  'resource-type': {
    type: 'string' as const,
    description: '平台 resourceTypeCode；通用 init 交互时可省略',
  },
  'resource-type-name': sharedInitArgs['resource-type-name'],
  'resource-name': sharedInitArgs['resource-name'],
  title: sharedInitArgs.title,
  namespace: sharedInitArgs.namespace,
  'templates-dir': sharedInitArgs['templates-dir'],
  pm: sharedInitArgs.pm,
  'skip-install': sharedInitArgs['skip-install'],
  'artifact-mode': sharedInitArgs['artifact-mode'],
  ...cliWriteCommandArgs,
};

export const initCommand = defineCommand({
  meta: {
    name: 'init',
    description:
      '工程立项五选一：init theme|widget|package <dir>（定稿类型+模板）或 init <dir>（交互选大类）',
  },
  args: initCommandArgs,
  async run({ rawArgs }) {
    try {
      const { preset, stripped } = resolveInitRawArgs(rawArgs);
      const args = parseArgs(stripped, initCommandArgs) as InitArgs;
      await runInitCommand(args, preset);
    } catch (error) {
      const { stripped } = resolveInitRawArgs(rawArgs);
      const args = parseArgs(stripped, initCommandArgs) as InitArgs;
      handleCommandError(error, args.json);
    }
  },
});
