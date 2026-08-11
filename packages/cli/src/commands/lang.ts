import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import {
  getCliLocale,
  initCliI18n,
  setCliLocale,
  type CliLocale,
} from '../i18n/index.js';
import { loadPersistedLocale, persistCliLocale } from '../i18n/localeConfig.js';

function normalizeLangInput(raw: string): CliLocale {
  const v = raw.trim().replace('-', '_');
  if (v === 'en' || v === 'en_US') return 'en_US';
  if (v === 'zh' || v === 'zh_CN') return 'zh_CN';
  throw cliError(I18N_KEYS.locale_only_zh_en, {
    code: 4,
    hint: 'freelog-cli lang set zh_CN',
  });
}

export const langShowCommand = defineCommand({
  meta: { name: 'show', description: '显示 CLI 语言：当前 / 持久化 / 环境变量' },
  args: {
    json: { type: 'boolean' },
    test: { type: 'boolean' },
    env: { type: 'string' },
    lang: { type: 'string' },
    debug: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      await initCliI18n();
      const payload = {
        current: getCliLocale(),
        persisted: loadPersistedLocale() ?? null,
        env: process.env.FREELOG_LANG ?? null,
      };
      if (args.json) {
        writeJsonSuccess('lang', payload);
      } else {
        consola.info(`当前: ${payload.current}`);
        consola.info(`持久化: ${payload.persisted ?? '（未设置，默认 zh_CN）'}`);
        if (payload.env) consola.info(`FREELOG_LANG: ${payload.env}`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const langSetCommand = defineCommand({
  meta: { name: 'set', description: '持久化 CLI 语言（zh_CN | en_US）' },
  args: {
    locale: { type: 'positional', required: true, description: 'zh_CN ? en_US' },
    json: { type: 'boolean' },
    test: { type: 'boolean' },
    env: { type: 'string' },
    lang: { type: 'string' },
    debug: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const locale = normalizeLangInput(String(args.locale));
      persistCliLocale(locale);
      setCliLocale(locale);
      await initCliI18n();
      if (args.json) {
        writeJsonSuccess('lang', { lang: locale });
      } else {
        consola.success(`语言已设为 ${locale}（写入 ~/.freelog-cli/settings.json）`);
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export const langCommand = defineCommand({
  meta: { name: 'lang', description: 'CLI 语言：show | set' },
  subCommands: {
    show: langShowCommand,
    set: langSetCommand,
  },
});
