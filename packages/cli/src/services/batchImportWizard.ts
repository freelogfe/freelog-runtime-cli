import * as p from '@clack/prompts';
import { consola } from 'consola';
import path from 'node:path';
import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import { createFromDir } from './fromDirService.js';
import { formatMediaDirHint, scanMediaDir } from './mediaDirScan.js';
import { pickResourceTypeForCategory } from './resourceTypePicker.js';

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
    if (p.isCancel(input)) throw new CliError('已取消', { code: 4 });
    mediaDir = String(input).trim();
  }

  const absDir = path.isAbsolute(mediaDir) ? mediaDir : path.resolve(opts.cwd, mediaDir);
  const scan = scanMediaDir(absDir);
  const hint = formatMediaDirHint(scan);
  if (hint) consola.info(hint);
  if (scan.mediaFiles === 0) {
    throw new CliError(`目录内没有可导入的媒体文件: ${absDir}`, {
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
    if (p.isCancel(ok) || !ok) throw new CliError('已取消批量导入', { code: 4 });
  }

  const picked = await pickResourceTypeForCategory('other');
  consola.success(`条目资源类型: ${picked.pathLabel} (${picked.code})`);

  const titlePrefix = await p.text({
    message: '资源标题前缀（可选，默认用文件名）',
    defaultValue: '',
  });
  if (p.isCancel(titlePrefix)) throw new CliError('已取消', { code: 4 });

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
  consola.info('  部分失败时查看 JSON details.failures / retry.batch.json 后重试');

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
