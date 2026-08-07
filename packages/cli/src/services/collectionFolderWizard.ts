import * as p from '@clack/prompts';
import { consola } from 'consola';
import path from 'node:path';
import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import { runInitScaffold } from './init/index.js';
import { createCollection, itemImportDir } from './collection/index.js';
import { formatMediaDirHint, scanMediaDir } from './mediaDirScan.js';
import { pickResourceTypeForCategory } from './init/index.js';
import { cliError } from '../i18n/cliError.js';
import { I18N_KEYS } from '../i18n/bundled.js';

export interface CollectionFolderWizardResult {
  projectDir: string;
  mediaDir: string;
  collectionResourceTypeCode: string;
  itemResourceTypeCode: string;
  importedCount: number;
}

export async function runCollectionFolderWizard(opts: {
  cwd: string;
  projectDir?: string;
  mediaDir?: string;
  yes?: boolean;
}): Promise<CollectionFolderWizardResult> {
  requireAuth();

  const collectionPick = await pickResourceTypeForCategory('collection');
  consola.success(`合集类型: ${collectionPick.pathLabel} (${collectionPick.code})`);

  let projectDirName = opts.projectDir?.trim();
  if (!projectDirName) {
    const input = await p.text({
      message: '合集项目目录名（将写入 freelog.manifest.json）',
      defaultValue: 'my-collection',
      validate: (v) =>
        /^[a-zA-Z0-9_-]+$/.test(String(v || '').trim()) ? undefined : '只能英文/数字/_/-',
    });
    if (p.isCancel(input)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    projectDirName = String(input).trim();
  }

  let mediaDir = opts.mediaDir?.trim();
  if (!mediaDir) {
    const input = await p.text({
      message: '媒体文件夹路径（每个文件先变成子资源，再加入合集目录）',
      validate: (v) => (v?.trim() ? undefined : '路径不能为空'),
    });
    if (p.isCancel(input)) throw cliError(I18N_KEYS.cancelled, { code: 4 });
    mediaDir = String(input).trim();
  }

  const absMedia = path.isAbsolute(mediaDir) ? mediaDir : path.resolve(opts.cwd, mediaDir);
  const scan = scanMediaDir(absMedia);
  const hint = formatMediaDirHint(scan);
  if (hint) consola.info(hint);
  if (scan.mediaFiles === 0) {
    throw cliError(I18N_KEYS.no_importable_media_in_dir, { code: 4 });
  }

  const itemPick = await pickResourceTypeForCategory('other');
  consola.success(`合集条目资源类型: ${itemPick.pathLabel} (${itemPick.code})`);

  const identity = await p.group({
    resourceName: () =>
      p.text({
        message: '合集资源短授权标识',
        defaultValue: projectDirName,
        validate: (v) =>
          /^[a-zA-Z0-9_-]+$/.test(String(v || '').trim()) ? undefined : '格式无效',
      }),
    title: () =>
      p.text({
        message: '合集标题',
        defaultValue: projectDirName,
        validate: (v) => (String(v || '').trim() ? undefined : '不能为空'),
      }),
  });
  if (p.isCancel(identity)) throw cliError(I18N_KEYS.cancelled, { code: 4 });

  if (!opts.yes) {
    const ok = await p.confirm({
      message: `创建合集项目并导入 ${scan.mediaFiles} 个文件为子资源？`,
      initialValue: true,
    });
    if (p.isCancel(ok) || !ok) throw cliError(I18N_KEYS.cancelled, { code: 4 });
  }

  const { projectDir } = await runInitScaffold({
    dir: projectDirName,
    cwd: opts.cwd,
    scaffold: 'collection',
    resourceTypeCode: collectionPick.code,
    resourceTypeName: collectionPick.name,
    resourceTypeLabels: collectionPick.resourceTypeLabels,
    resourceName: String(identity.resourceName).trim(),
    title: String(identity.title).trim(),
    overwrite: Boolean(opts.yes),
  });

  await createCollection({ cwd: projectDir });

  const importResult = await itemImportDir({
    cwd: projectDir,
    dir: absMedia,
    resourceTypeCode: itemPick.code,
    resourceTypeName: itemPick.name,
    yes: true,
  });

  consola.info('下一步:');
  consola.info('  cd ' + projectDir);
  consola.info('  freelog-cli collection version set --description "首版" --env dev');
  consola.info('  freelog-cli collection publish --yes --env dev');
  consola.info('  freelog-cli collection policy apply --from-file ./policy.free.json --yes --env dev');
  consola.info('  freelog-cli online --yes --env dev');
  consola.info('注意: 子资源需有版本+启用策略；import-dir 会尝试 policy/online');

  return {
    projectDir,
    mediaDir: absMedia,
    collectionResourceTypeCode: collectionPick.code,
    itemResourceTypeCode: itemPick.code,
    importedCount: importResult.created.length,
  };
}
