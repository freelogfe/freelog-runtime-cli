import { defineCommand } from 'citty';
import { consola } from 'consola';
import { authScopeLabel } from '../core/auth.js';
import { applyCommandFlags, handleCommandError, writeJsonSuccess } from '../core/command.js';
import { resolveCwd } from '../config/project.js';
import { buildProjectStatus } from '../services/statusService.js';

function printStatusHuman(payload: Awaited<ReturnType<typeof buildProjectStatus>>): void {
  consola.info(`环境: ${payload.environment} (${payload.apiBaseURL})`);
  if (payload.loggedIn) {
    const scope =
      payload.auth?.scope != null ? `，${authScopeLabel(payload.auth.scope)}` : '';
    consola.success(
      `已登录: ${payload.auth?.username} (userId=${payload.auth?.userId}${scope})`,
    );
  } else {
    consola.warn('未登录');
  }
  if (payload.owner) {
    const mark =
      payload.owner.matchLogin === true ? '✅' : payload.owner.matchLogin === false ? '❌' : '—';
    consola.info(`所属用户: ${payload.owner.username} (${payload.owner.userId}) ${mark}`);
  }
  consola.info(`同步: ${payload.sync}`);
  if (payload.platform) {
    consola.info(
      `平台: latest=${payload.platform.latestVersion || '—'} status=${payload.platform.status} policies(enabled)=${payload.platform.enabledPolicyCount}`,
    );
  }
  if (payload.platformVersionDraft?.exists) {
    consola.warn(
      `平台发版草稿: 有  (updateDate: ${payload.platformVersionDraft.updateDate || '—'})`,
    );
  } else {
    consola.info('平台发版草稿: 无');
  }
  if (payload.localDraftSync) {
    consola.info(
      `本地相对上次草稿同步: ${payload.localDraftSync.dirty ? '有未 push 变更' : '已对齐'}`,
    );
  } else if (payload.platformVersionDraft?.exists) {
    consola.warn('本地草稿同步: 从未同步（可能来自 Console 防抖自动保存）');
  } else {
    consola.info('本地草稿同步: 从未同步');
  }
  if (payload.draftAdviceHint) {
    consola.info(`建议: ${payload.draftAdviceHint}`);
    consola.info('      freelog-cli draft pull');
    consola.info('      或 freelog-cli draft push --force');
    consola.info('      或 freelog-cli draft discard');
  }
  consola.info(
    `本地版本意图: ${payload.local.version || '—'} file=${payload.local.filePath || '—'}`,
  );
  if (payload.collection) {
    consola.info(
      `合集: id=${payload.collection.resourceId || '—'} items=${payload.collection.itemCount} rules=${payload.collection.hasCollectRules ? '有' : '无'} rss=${payload.collection.rssFeedUrl || '—'}`,
    );
    consola.info(
      `合集发版表单草稿: 平台=${payload.collection.platformFormDraftExists === null ? '—' : payload.collection.platformFormDraftExists ? '有' : '无'} 本地sync=${payload.collection.draftSync ? (payload.collection.draftSync.dirty ? '有未 push 变更' : '已对齐') : '从未同步'}`,
    );
    if (payload.collection.draftAdviceHint) {
      consola.info(`合集建议: ${payload.collection.draftAdviceHint}`);
      consola.info('      freelog-cli draft pull --collection');
      consola.info('      或 freelog-cli draft push --collection --force');
      consola.info('      或 freelog-cli draft discard --collection');
    }
  }
}

export const statusCommand = defineCommand({
  meta: { name: 'status', description: '登录态 + owner + 同步 + 平台发版草稿' },
  args: {
    test: { type: 'boolean' },
    env: { type: 'string', description: '运行环境：production/prod/test/dev' },
    cwd: { type: 'string' },
    json: { type: 'boolean' },
    debug: { type: 'boolean', description: '打印脱敏调试信息' },
  },
  async run({ args }) {
    try {
      applyCommandFlags(args);
      const payload = await buildProjectStatus(resolveCwd(args.cwd));
      if (args.json) {
        const { ok: _ok, ...data } = payload;
        writeJsonSuccess('status', data);
        return;
      }
      printStatusHuman(payload);
    } catch (error) {
      handleCommandError(error, args.json);
    }
  },
});
