import fs from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import {
  AUTH_MAP_TEMPLATE_YAML,
  POLICY_FREE_JSON_COLLECTION,
  POLICY_FREE_JSON_RESOURCE,
} from '../services/scaffoldTemplates.js';
import { collectionStoreFromCwd } from './store/index.js';

export function resolvePolicyInitTarget(cwd: string, collection?: boolean): {
  outfile: string;
  payload: typeof POLICY_FREE_JSON_RESOURCE;
} {
  const isCollection = collection ?? Boolean(collectionStoreFromCwd(cwd).tryLoad());
  const outfile = path.join(cwd, 'policy.free.json');
  const payload = isCollection ? POLICY_FREE_JSON_COLLECTION : POLICY_FREE_JSON_RESOURCE;
  return { outfile, payload };
}

export function writePolicyInitFile(
  cwd: string,
  opts?: { collection?: boolean; force?: boolean },
): { path: string; skipped: boolean } {
  const { outfile, payload } = resolvePolicyInitTarget(cwd, opts?.collection);
  if (fs.existsSync(outfile) && !opts?.force) {
    return { path: outfile, skipped: true };
  }
  fs.writeFileSync(outfile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { path: outfile, skipped: false };
}

export function writeAuthMapInitFile(
  cwd: string,
  opts?: { force?: boolean; filename?: string },
): { path: string; skipped: boolean } {
  const outfile = path.join(cwd, opts?.filename || 'auth-map.yaml');
  if (fs.existsSync(outfile) && !opts?.force) {
    return { path: outfile, skipped: true };
  }
  fs.writeFileSync(outfile, AUTH_MAP_TEMPLATE_YAML, 'utf8');
  return { path: outfile, skipped: false };
}

const policyInit = defineCommand({
  meta: { name: 'init', description: '生成 policy.free.json（FOR PUBLIC 免费策略模板）' },
  args: {
    collection: { type: 'boolean', description: '合集语法模板（默认按 manifest subject 推断）' },
    force: { type: 'boolean', description: '覆盖已有文件' },
    cwd: { type: 'string' },
    test: { type: 'boolean' },
    env: { type: 'string' },
    json: { type: 'boolean' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      const { path: outfile, skipped } = writePolicyInitFile(cwd, {
        collection: args.collection,
        force: args.force,
      });
      if (args.json) {
        writeJsonSuccess('scaffold', { path: outfile, skipped });
      } else if (skipped) {
        consola.info(`${outfile} 已存在（加 --force 覆盖）`);
      } else {
        consola.success(`已创建 ${outfile}`);
        consola.info('下一步: freelog-cli policy apply --from-file policy.free.json --yes --env dev');
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

export { policyInit };
