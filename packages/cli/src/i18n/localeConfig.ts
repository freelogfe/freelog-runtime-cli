import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CliLocale } from './bundled.js';

const SETTINGS_DIR = path.join(os.homedir(), '.freelog-cli');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

export interface CliSettings {
  lang?: CliLocale;
}

export function getCliSettingsPath(): string {
  return SETTINGS_FILE;
}

export function loadCliSettings(): CliSettings {
  if (!fs.existsSync(SETTINGS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) as CliSettings;
  } catch {
    return {};
  }
}

export function saveCliSettings(settings: CliSettings): void {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
}

export function loadPersistedLocale(): CliLocale | undefined {
  const lang = loadCliSettings().lang;
  return lang === 'en_US' || lang === 'zh_CN' ? lang : undefined;
}

export function persistCliLocale(lang: CliLocale): void {
  saveCliSettings({ ...loadCliSettings(), lang });
}
