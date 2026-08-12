import fs from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { cliEnvArgs, cliOutputArgs, cliReadCommandArgs } from '../core/cliArgs.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { getCliEnv, normalizeCliEnvForWriteGuard } from '../core/env.js';
import {
  DEFAULT_PROJECT_CONFIG_COMMENT,
  findProjectConfig,
  projectConfigPath,
  writeProjectConfig,
} from '../core/projectConfig.js';
import { resolveCwd } from '../config/project.js';
import { DEFAULT_FREELOGIGNORE } from '../services/freelogIgnore.js';

const configShow = defineCommand({
  meta: { name: 'show', description: '显示项目 .freelog/config.json 与当前生效环境' },
  args: cliReadCommandArgs,
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const found = findProjectConfig(cwd);
      const payload = {
        configPath: found?.path ?? null,
        config: found?.config ?? null,
        effectiveEnv: getCliEnv(),
      };
      if (args.json) {
        writeJsonSuccess('config', payload);
        return;
      }
      if (found) {
        consola.info(`配置文件: ${found.path}`);
        consola.info(`defaultEnv: ${found.config.defaultEnv ?? '(未设置)'}`);
      } else {
        consola.warn('未找到 .freelog/config.json');
      }
      consola.info(`当前生效环境: ${payload.effectiveEnv}`);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const configSet = defineCommand({
  meta: { name: 'set', description: '写入 .freelog/config.json 字段' },
  args: {
    'default-env': { type: 'string', description: 'defaultEnv：dev|test|prod|production' },
    cwd: cliReadCommandArgs.cwd,
    test: cliEnvArgs.test,
    json: cliOutputArgs.json,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      if (!args['default-env']) {
        throw cliError(I18N_KEYS.default_env_required, { code: 4 });
      }
      const defaultEnv = normalizeCliEnvForWriteGuard(args['default-env']);
      if (!defaultEnv) {
        throw cliError(I18N_KEYS.default_env_invalid, { code: 4 });
      }
      const file = writeProjectConfig(cwd, { defaultEnv });
      if (args.json) {
        writeJsonSuccess('config', { path: file, defaultEnv });
      } else {
        consola.success(`已写入 ${file}（defaultEnv=${defaultEnv}）`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const configInit = defineCommand({
  meta: { name: 'init', description: '初始化 .freelog/config.json 与 .freelogignore 模板' },
  args: {
    'default-env': { type: 'string', description: 'defaultEnv，默认 dev' },
    force: { type: 'boolean', description: '覆盖已有文件' },
    ...cliReadCommandArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const defaultEnv =
        normalizeCliEnvForWriteGuard(args['default-env']) ||
        DEFAULT_PROJECT_CONFIG_COMMENT.defaultEnv;
      const created: string[] = [];

      const configFile = projectConfigPath(cwd);
      if (!fs.existsSync(configFile) || args.force) {
        writeProjectConfig(cwd, { defaultEnv });
        created.push(configFile);
      }

      const ignoreFile = path.join(cwd, '.freelogignore');
      if (!fs.existsSync(ignoreFile) || args.force) {
        fs.writeFileSync(ignoreFile, DEFAULT_FREELOGIGNORE, 'utf8');
        created.push(ignoreFile);
      }

      if (args.json) {
        writeJsonSuccess('config', { created, defaultEnv, skipped: created.length === 0 });
      } else if (created.length === 0) {
        consola.info('配置文件已存在（加 --force 覆盖）');
      } else {
        consola.success(`已创建: ${created.join(', ')}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const configCommand = defineCommand({
  meta: { name: 'config', description: '项目级配置（默认 env、ignore 模板）' },
  subCommands: {
    show: configShow,
    set: configSet,
    init: configInit,
  },
});
