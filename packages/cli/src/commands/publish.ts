import { defineCommand } from 'citty';
import { consola } from 'consola';
import {applyWriteCommandFlags, handleCommandError, writeJsonSuccess} from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { cliWriteCommandArgs } from '../core/cliArgs.js';
import { publishVersion } from '../services/resource/index.js';
import { applyReuseVersionIntent } from '../services/resource/reuseVersionIntent.js';
import { ensureSynced } from '../services/sync/index.js';
import { projectStoreFromCwd } from '../services/store/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';
import { computeBumpedVersion } from '../services/resource/publishVersion.js';
import { isInteractive } from '../core/tty.js';
import { infoPublishFileConstraints } from '../services/publishFileHints.js';

export const publishCommand = defineCommand({
  meta: { name: 'publish', description: '正式发行版本（sha1 → Storage → createVersion）' },
  args: {
    'dry-run': {
      type: 'boolean',
      description: '解析属性并输出 createVersion 请求体，不上传/不写平台',
    },
    bump: { type: 'boolean', description: '基于平台 latestVersion 自动升 patch 再发行' },
    version: { type: 'string', description: '目标 semver；省略时沿用 manifest.version' },
    description: { type: 'string', description: '版本描述（reuse 时覆盖平台描述）' },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const store = projectStoreFromCwd(resolveCwd(args.cwd));
      const reuseVersion = typeof args['reuse-version'] === 'string' ? args['reuse-version'] : undefined;
      const requestedVersion = typeof args.version === 'string' ? args.version : undefined;
      const description = typeof args.description === 'string' ? args.description : undefined;
      if (reuseVersion) {
        const ctx = await ensureSynced({ store, noAutoPull: args['no-auto-pull'] });
        const resourceId = ctx.resource.resourceId!;
        let targetVersion = requestedVersion?.trim() || store.tryLoadVersion()?.version?.trim();
        if (args.bump) {
          targetVersion = computeBumpedVersion(ctx.info.latestVersion);
        }
        if (!targetVersion) {
          throw cliError(I18N_KEYS.manifest_version_missing, {
            code: 4,
            hint: '传 --version 或 --bump',
          });
        }
        await applyReuseVersionIntent({
          store,
          resourceId,
          resourceName: ctx.resource.resourceName,
          resourceTypeCode: ctx.resource.resourceTypeCode,
          userId: ctx.resource.userId,
          username: ctx.resource.username,
          reuseVersion,
          targetVersion,
          description,
          noInheritDeps: args['no-inherit-deps'],
        });
      }
      if (!args['dry-run'] && isInteractive(args.yes)) {
        const versionCfg = store.tryLoadVersion();
        if (versionCfg?.filePath?.trim()) {
          const resourceCfg = store.loadResource();
          if (resourceCfg.resourceTypeCode) {
            await infoPublishFileConstraints({
              cwd: resolveCwd(args.cwd),
              filePath: versionCfg.filePath,
              resourceTypeCode: resourceCfg.resourceTypeCode,
              versionConfig: versionCfg,
            });
          }
        }
      }
      const result = await publishVersion({
        store,
        noAutoPull: args['no-auto-pull'],
        bump: args.bump && !reuseVersion,
        dryRun: args['dry-run'],
        debug: args.debug,
      });
      if (args.json) {
        writeJsonSuccess('publish', result);
      } else {
        consola.success(
          `已发行 ${result.version}（${result.filename}，sha1=${result.fileSha1.slice(0, 12)}…）`,
        );
      }
    } catch (error) {
      handleCommandError(error, args.json, 'publish');
    }
  },
});
