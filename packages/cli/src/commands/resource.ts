import path from 'node:path';
import { defineCommand } from 'citty';
import { consola } from 'consola';
import { applyCommandFlags, applyWriteCommandFlags, handleCommandError, writeJsonSuccess } from '../core/command.js';
import { cliJsonLinesArg, cliReadCommandArgs, cliWriteCommandArgs } from '../core/cliArgs.js';
import { resolveCwd } from '../config/project.js';
import type { ArtifactMode, RuntimeVersion } from '../config/project.js';
import { isInteractive } from '../core/tty.js';
import { createFromDir, createBatchProgressFormatter } from '../services/batch/index.js';
import { runBatchImportWizard } from '../services/batchImportWizard.js';
import { searchResources } from '../services/resourceSearchService.js';
import { assertResourceTypeCode } from '../services/typeService.js';
import {
  applySessionPublishIntent,
  createThenPublish,
  publishVersion,
} from '../services/resource/index.js';
import { updateListing } from '../services/resourceService.js';
import {
  assertSessionMode,
  finalizeSessionCommand,
  resolveCommandProjectStore,
} from '../services/store/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

const importDirCommand = defineCommand({
  meta: {
    name: 'import-dir',
    description: '把目录内文件发布成多个独立资源',
  },
  args: {
    dir: { type: 'positional', required: false, description: '文件目录；--resume/--retry 时可省略' },
    'resource-type': { type: 'string', description: 'resourceTypeCode；也可写在 --config defaults.resourceTypeCode' },
    'resource-type-name': { type: 'string', description: '自定义资源类型名（可选）' },
    'title-prefix': { type: 'string', description: '资源标题前缀' },
    config: { type: 'string', description: 'freelog.batch.json/yaml；默认自动发现目录内同名文件' },
    resume: { type: 'string', description: '从正式批量报告的最后安全阶段继续' },
    retry: { type: 'string', description: '只重新执行正式批量报告中的失败项' },
    'strict-batch-limit': {
      type: 'boolean',
      description: '与 Console UI 一致：单次最多 20 个文件，超限报错（默认自动分 batch 并 warn）',
    },
    ...cliWriteCommandArgs,
    ...cliJsonLinesArg,
  },
  async run({ args }) {
    try {
      applyWriteCommandFlags(args);
      const cwd = resolveCwd(args.cwd);
      if (!args.dir && !args.resume && !args.retry) {
        throw new Error('请提供文件目录，或使用 --resume/--retry <report>');
      }
      if (args.resume && args.retry) throw new Error('--resume 与 --retry 不能同时使用');
      const dir = args.dir ? path.resolve(cwd, String(args.dir)) : cwd;

      if (!args['resource-type'] && !args.resume && !args.retry && isInteractive(args.yes)) {
        const batch = await runBatchImportWizard({
          cwd,
          dir: String(args.dir),
          yes: Boolean(args.yes),
        });
        if (args.json) {
          writeJsonSuccess('resource import-dir', batch);
        } else {
          consola.success(`已从目录导入 ${batch.createdCount} 个独立资源`);
          for (const item of batch.items) {
            consola.info(`${item.subdir}  ${item.resourceId}  ${item.resourceName}`);
          }
        }
        return;
      }

      if (args['resource-type']) await assertResourceTypeCode(args['resource-type']);

      const jsonLines = Boolean(args['json-lines']);
      const formatProgress = createBatchProgressFormatter('resource import-dir');
      const onProgress = jsonLines
        ? (event: Parameters<typeof formatProgress>[0]) => {
            process.stdout.write(formatProgress(event));
          }
        : undefined;
      let reportFile: string | undefined;

      const created = await createFromDir({
        dir,
        typeCode: args['resource-type'],
        resourceTypeName: args['resource-type-name'],
        titlePrefix: args['title-prefix'],
        configFile: args.config,
        cwd,
        yes: Boolean(args.yes),
        strictBatchLimit: Boolean(args['strict-batch-limit']),
        onProgress,
        onReportCreated: (value) => {
          reportFile = value;
        },
        resumeReport: args.resume,
        retryReport: args.retry,
      });

      if (jsonLines) {
        return;
      }

      if (args.json) {
        writeJsonSuccess('resource import-dir', { created, reportFile });
      } else {
        consola.success(`已从目录导入 ${created.length} 个资源`);
        if (reportFile) consola.info(`正式报告: ${reportFile}`);
        for (const item of created) {
          consola.info(`${item.subdir}  ${item.resourceId}  ${item.resourceName}`);
        }
      }
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const searchCommand = defineCommand({
  meta: {
    name: 'search',
    description: '按关键词或授权名搜索当前账号下的资源',
  },
  args: {
    query: { type: 'positional', required: true, description: 'resourceId、授权名或标题关键词' },
    limit: { type: 'string', description: '最多返回条数（默认 20，最大 50）' },
    ...cliReadCommandArgs,
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const limit = args.limit ? Number(args.limit) : undefined;
      const hits = await searchResources({ query: String(args.query), limit });
      if (args.json) {
        writeJsonSuccess('resource search', { count: hits.length, items: hits });
        return;
      }
      if (!hits.length) {
        consola.warn('未找到匹配资源');
        return;
      }
      consola.info(`找到 ${hits.length} 个资源:`);
      for (const hit of hits) {
        consola.info(
          `${hit.resourceId}  ${hit.resourceName}  ${hit.resourceTitle || '—'}  latest=${hit.latestVersion || '—'}`,
        );
      }
      consola.info('半路接入: freelog-cli bind <resourceId> --apply-listing');
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});

const publishCommand = defineCommand({
  meta: {
    name: 'publish',
    description: '会话模式正式发行（--session；工程目录请用顶层 publish）',
  },
  args: {
    file: { type: 'string', description: '发布文件或构建目录路径' },
    title: { type: 'string', description: '首发资源标题' },
    type: { type: 'string', description: '首发 resourceTypeCode' },
    name: { type: 'string', description: '首发短授权标识（可选）' },
    'type-name': { type: 'string', description: '首发自定义类型名（可选）' },
    version: { type: 'string', description: 'semver 版本号' },
    bump: { type: 'boolean', description: '基于平台 latestVersion 自动升 patch' },
    description: { type: 'string', description: '版本说明' },
    'video-cover': { type: 'string', description: '视频版本封面 URL 或本地路径' },
    'artifact-mode': { type: 'string', description: 'file 或 directory-zip' },
    runtime: { type: 'string', description: '0.4 | 0.5（主题/插件）' },
    'dry-run': {
      type: 'boolean',
      description: '解析属性并输出 createVersion 请求体，不上传/不写平台',
    },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      assertSessionMode(args, '请使用 freelog-cli resource publish --session …');
      applyWriteCommandFlags(args);

      const cwd = resolveCwd(args.cwd);
      const store = resolveCommandProjectStore({
        cwd,
        session: true,
        'resource-id': args['resource-id'],
      });

      const artifactMode =
        args['artifact-mode'] === 'directory-zip' || args['artifact-mode'] === 'file'
          ? (args['artifact-mode'] as ArtifactMode)
          : undefined;
      const runtime =
        args.runtime === '0.4' || args.runtime === '0.5'
          ? (args.runtime as RuntimeVersion)
          : undefined;

      const publishOpts = {
        store,
        noAutoPull: args['no-auto-pull'],
        dryRun: args['dry-run'],
        debug: args.debug,
      };

      let result;
      if (args['resource-id']) {
        await applySessionPublishIntent({
          store,
          file: args.file,
          reuseVersion: args['reuse-version'],
          version: args.version,
          bump: args.bump,
          description: args.description,
          videoCover: args['video-cover'],
          artifactMode,
          runtime,
          noInheritDeps: args['no-inherit-deps'],
        });
        result = await publishVersion(publishOpts);
      } else {
        result = await createThenPublish({
          store,
          title: args.title,
          typeCode: args.type,
          name: args.name,
          resourceTypeName: args['type-name'],
          file: args.file,
          version: args.version,
          bump: args.bump,
          description: args.description,
          videoCover: args['video-cover'],
          artifactMode,
          runtime,
          ...publishOpts,
        });
      }

      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: {
          resourceId: result.resourceId,
          resourceName: store.loadResource().resourceName,
          version: result.version,
          fileSha1: result.fileSha1,
          filename: result.filename,
          ...result,
        },
      });

      if (args.json) {
        writeJsonSuccess('resource publish', payload);
      } else {
        consola.success(
          `已发行 ${result.version}（${result.filename}，sha1=${result.fileSha1.slice(0, 12)}…，session）`,
        );
      }
    } catch (error) {
      handleCommandError(error, args.json, 'resource publish');
    }
  },
});

const updateCommand = defineCommand({
  meta: {
    name: 'update',
    description: '会话模式更新 listing（--session；工程目录请用顶层 update）',
  },
  args: {
    title: { type: 'string', description: '资源标题' },
    intro: { type: 'string', description: '简介（最多 200 字）' },
    cover: { type: 'string', description: '封面本地路径或 URL' },
    tags: { type: 'string', description: '逗号分隔 tags' },
    ...cliWriteCommandArgs,
  },
  async run({ args }) {
    try {
      assertSessionMode(args, '请使用 freelog-cli resource update --session …');
      applyWriteCommandFlags(args);
      if (!args['resource-id']?.trim()) {
        throw cliError(I18N_KEYS.session_resource_id_required, { code: 4 });
      }
      if (!args.title && args.intro === undefined && !args.cover && !args.tags) {
        throw cliError(I18N_KEYS.update_at_least_one_field, { code: 4 });
      }

      const store = resolveCommandProjectStore({
        cwd: resolveCwd(args.cwd),
        session: true,
        'resource-id': args['resource-id'],
      });
      const data = await updateListing({
        store,
        title: args.title,
        intro: args.intro,
        cover: args.cover,
        tags: args.tags ? args.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        noAutoPull: args['no-auto-pull'],
      });

      const payload = finalizeSessionCommand({
        store,
        exportProject: args['export-project'],
        result: { resource: data },
      });
      if (args.json) writeJsonSuccess('resource update', payload);
      else consola.success('已更新 listing（session）');
    } catch (error) {
      handleCommandError(error, args.json, 'resource update');
    }
  },
});

export const resourceCommand = defineCommand({
  meta: { name: 'resource', description: '资源批量导入、搜索与会话维护' },
  subCommands: {
    'import-dir': importDirCommand,
    search: searchCommand,
    publish: publishCommand,
    update: updateCommand,
  },
});
