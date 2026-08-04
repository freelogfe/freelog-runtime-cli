import fs from 'node:fs';
import path from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, handleCommandError } from '../core/command.js';
import { CliError } from '../core/errors.js';
import { findProjectFilePath, resolveCwd } from '../config/project.js';
import { pullResourceToLocal } from '../services/syncService.js';
import { pullCollection } from '../services/collectionService.js';

export const pullCommand = defineCommand({
  meta: { name: 'pull', description: '平台 → 本地缓存（含 owner）' },
  args: {
    version: { type: 'string', description: '写入本地版本意图为该版本号' },
    collection: {
      type: 'boolean',
      description: '合集 pull（info + catalogue draft + collectRules）',
    },
    all: {
      type: 'boolean',
      description: '对 cwd 下各子目录（含 manifest/state）逐个 pull',
    },
    'apply-listing': {
      type: 'boolean',
      description: '将平台 listing 显式写回 manifest.resource',
    },
    force: {
      type: 'boolean',
      description: '与 --apply-listing 配合，允许覆盖本地 listing 意图',
    },
    cwd: { type: 'string' },
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const cwd = resolveCwd(args.cwd);

      if (args.all) {
        if (args.collection) {
          throw new CliError('--all 与 --collection 不能同时使用', { code: 4 });
        }
        const entries = fs.readdirSync(cwd, { withFileTypes: true }).filter((d) => d.isDirectory());
        const results: Array<{ dir: string; ok: boolean; resourceId?: string; error?: string }> = [];
        for (const ent of entries) {
          const sub = path.join(cwd, ent.name);
          if (!findProjectFilePath('resource', sub)) continue;
          try {
            const pulled = await pullResourceToLocal({
              cwd: sub,
              version: args.version,
              applyListing: args['apply-listing'],
              force: args.force,
            });
            results.push({ dir: ent.name, ok: true, resourceId: pulled.resource.resourceId });
          } catch (error) {
            results.push({
              dir: ent.name,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        if (results.length === 0) {
          throw new CliError('未找到含 freelog.manifest.json 的子资源目录', { code: 4 });
        }
        if (args.json) {
          process.stdout.write(`${JSON.stringify({ ok: results.every((r) => r.ok), results })}\n`);
        } else {
          for (const r of results) {
            if (r.ok) consola.success(`${r.dir}: ${r.resourceId}`);
            else consola.error(`${r.dir}: ${r.error}`);
          }
        }
        if (results.some((r) => !r.ok)) process.exitCode = 1;
        return;
      }

      if (args.collection) {
        const result = await pullCollection({
          cwd,
          applyListing: args['apply-listing'],
          force: args.force,
        });
        if (args.json) {
          process.stdout.write(
            `${JSON.stringify({
              ok: true,
              resourceId: result.collection.resourceId,
              userId: result.collection.userId,
              username: result.collection.username,
              itemCount: Array.isArray(result.catalogueItems)
                ? result.catalogueItems.length
                : 0,
            })}\n`,
          );
        } else {
          consola.success(
            `已 pull 合集 ${result.collection.resourceId}（owner=${result.collection.username}/${result.collection.userId}）`,
          );
        }
        return;
      }

      const result = await pullResourceToLocal({
        cwd,
        version: args.version,
        applyListing: args['apply-listing'],
        force: args.force,
      });
      if (args.json) {
        process.stdout.write(
          `${JSON.stringify({
            ok: true,
            resourceId: result.resource.resourceId,
            userId: result.resource.userId,
            username: result.resource.username,
            latestVersion: result.info.latestVersion,
            localVersion: result.version?.version ?? null,
          })}\n`,
        );
      } else {
        consola.success(
          `已 pull ${result.resource.resourceId}（owner=${result.resource.username}/${result.resource.userId}）`,
        );
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
