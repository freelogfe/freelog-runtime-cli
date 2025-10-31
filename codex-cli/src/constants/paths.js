import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HOME_DIR = os.homedir();
export const WORKING_DIR = process.cwd();
const CURRENT_FILE = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = path.resolve(path.dirname(CURRENT_FILE), '..', '..');
export const REPO_ROOT = path.resolve(PROJECT_ROOT, '..');
export const GLOBAL_DATA_DIR = path.join(HOME_DIR, '.freelog-cli');
export const GLOBAL_CREDENTIALS_FILE = path.join(GLOBAL_DATA_DIR, 'credentials.json');
export const GLOBAL_CONFIG_FILE = path.join(GLOBAL_DATA_DIR, 'freelog.json');
export const LOG_DIR = path.join(GLOBAL_DATA_DIR, 'logs');

export const WORKSPACE_DATA_DIR = path.join(WORKING_DIR, '.freelog-cli');
export const WORKSPACE_CREDENTIALS_FILE = path.join(WORKSPACE_DATA_DIR, 'credentials.json');
export const WORKSPACE_LOG_DIR = path.join(WORKSPACE_DATA_DIR, 'logs');

export const DEFAULT_CONFIG_FILE = path.join(WORKING_DIR, 'freelog.json');
export const TEMPLATE_ROOT = path.resolve(REPO_ROOT, 'templates');
