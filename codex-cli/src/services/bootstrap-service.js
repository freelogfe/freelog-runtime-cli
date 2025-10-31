import { ensureDir } from '../utils/fs.js';
import {
  GLOBAL_DATA_DIR,
  LOG_DIR,
  WORKSPACE_DATA_DIR,
  WORKSPACE_LOG_DIR
} from '../constants/paths.js';
import { loadEnv } from '../config/env.js';
import { getLogger } from './logger.js';

const ENSURE_PATHS = [GLOBAL_DATA_DIR, LOG_DIR, WORKSPACE_DATA_DIR, WORKSPACE_LOG_DIR];

export async function ensureInitialised() {
  loadEnv();
  for (const dir of ENSURE_PATHS) {
    await ensureDir(dir);
  }
  await getLogger();
}
