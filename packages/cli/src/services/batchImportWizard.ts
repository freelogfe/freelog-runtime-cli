import * as p from '@clack/prompts';
import { consola } from 'consola';
import path from 'node:path';
import { requireAuth } from '../core/auth.js';
import { createFromDir } from './batch/index.js';
import { clackTextField } from './shared/fieldConstraints.js';
import { formatMediaDirHint, scanMediaDir } from './mediaDirScan.js';
import { pickResourceTypeForCategory } from './init/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

export interface BatchImportWizardResult {
  dir: string;
  resourceTypeCode: string;
  createdCount: number;
  items: Array<{ subdir: string; resourceId: string; resourceName: string }>;
}

export async function runBatchImportWizard(opts: {
  cwd: string;
  dir?: string;
  yes?: boolean;
}): Promise<BatchImportWizardResult> {
  requireAuth();

  let mediaDir = opts.dir?.trim();
  if (!mediaDir) {
    const input = await p.text({
      message: '请输入媒体文件夹路径（顶层每个文件将变成一个独立资源）',
      validate: (v) => (v?.trim() ? undefined : '路径不能为空'),
    });
    if (p.isCancel(input)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    mediaDir = String(input).trim();
  }

  const absDir = path.isAbsolute(mediaDir) ? mediaDir : path.resolve(opts.cwd, mediaDir);
  const scan = scanMediaDir(absDir);
  const hint = formatMediaDirHint(scan);
  if (hint) consola.info(hint);
  if (scan.mediaFiles === 0) {
    throw cliError(I18N_KEYS.no_importable_media_in_dir, {
      code: 4,
      hint: 'import-dir 只处理顶层文件；支持 jpg/png/mp4 等',
    });
  }

  consola.info(`将导入 ${scan.mediaFiles} 个文件为 ${scan.mediaFiles} 个独立资源`);

  if (!opts.yes) {
    const ok = await p.confirm({
      message: `确认批量导入 ${scan.mediaFiles} 个文件？`,
      initialValue: true,
    });
    if (p.isCancel(ok) || !ok) throw cliError(I18N_KEYS.cancelled_batch_import, { code: 4 });
  }

  const picked = await pickResourceTypeForCategory('other');
  consola.success(`条目资源类型: ${picked.pathLabel} (${picked.code})`);

  const titlePrefix = await p.text(
    clackTextField('FORM-BATCH-TITLE', { defaultValue: '' }),
  );
  if (p.isCancel(titlePrefix)) throw cliError(I18N_KEYS.cancelled, { code: 4 });

  const created = await createFromDir({
    dir: absDir,
    typeCode: picked.code,
    resourceTypeName: picked.name,
    titlePrefix: String(titlePrefix).trim() || undefined,
    cwd: opts.cwd,
    yes: true,
  });

  consola.info('下一步（每个子目录可单独 policy/online，或批量配置 freelog.batch.json）：');
  consola.info('  freelog-cli policy apply --from-file ./policy.free.json --cwd <子目录> --yes --env dev');
  consola.info('  部分失败时使用 .freelog/reports/<runId>.json 配合 --retry / --resume');

  return {
    dir: absDir,
    resourceTypeCode: picked.code,
    createdCount: created.length,
    items: created.map((c) => ({
      subdir: c.subdir,
      resourceId: c.resourceId,
      resourceName: c.resourceName,
    })),
  };
}
