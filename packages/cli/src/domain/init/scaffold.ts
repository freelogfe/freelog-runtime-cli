import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CliError } from '../../core/errors';
import { createIdentity, listIdentityNumbers } from '../../local/identity';
import { indexFilePath, repairIndex } from '../../local/indexFile';
import { withProjectLock } from '../../local/lock';
import type { IdentityRecord } from '../../local/types';

export type ScaffoldKind = 'runtime' | 'package' | 'none' | 'collection';

export type InitProjectInput = {
  cwd: string;
  dir?: string;
  scaffold: ScaffoldKind;
  shortcut?: 'theme' | 'widget' | 'package';
  typeCode?: string;
  filePath?: string;
  template?: string;
  namespace?: string;
  yes?: boolean;
};

function normalizeName(raw: string): string {
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return name || 'resource';
}

export function resolveTargetDir(input: Pick<InitProjectInput, 'cwd' | 'dir'>): string {
  if (!input.dir) {
    return path.resolve(input.cwd);
  }
  return path.isAbsolute(input.dir) ? input.dir : path.resolve(input.cwd, input.dir);
}

export function initProject(input: InitProjectInput): IdentityRecord {
  if (input.scaffold === 'collection') {
    // i18n: cli.init.collection_unsupported
    throw new CliError('合集本期不做', 'INIT_COLLECTION_UNSUPPORTED');
  }

  const targetDir = resolveTargetDir(input);
  mkdirSync(targetDir, { recursive: true });

  return withProjectLock(targetDir, () => {
    if (existsSync(indexFilePath(targetDir)) && !input.yes) {
      // i18n: cli.init.index_exists
      throw new CliError('已有 index.json。覆盖请加 --yes', 'INIT_INDEX_EXISTS');
    }
    if (listIdentityNumbers(targetDir).length > 0 && !input.yes) {
      // i18n: cli.init.already
      throw new CliError('当前目录已有身份文件。覆盖请加 --yes', 'INIT_ALREADY');
    }

    let typeCode = input.typeCode;
    let filePath = input.filePath;

    if (input.shortcut === 'theme') {
      typeCode = 'RT001';
      filePath = 'dist';
    } else if (input.shortcut === 'widget') {
      typeCode = 'RT002';
      filePath = 'dist';
    }

    if (
      (input.shortcut === 'theme' || input.shortcut === 'widget') &&
      input.yes &&
      !input.template
    ) {
      // i18n: cli.init.template_required
      throw new CliError(
        'init theme / widget 使用 --yes 时必须带 --template',
        'INIT_TEMPLATE_REQUIRED',
      );
    }
    if (input.shortcut === 'package' && input.yes && (!input.template || !input.namespace)) {
      // i18n: cli.init.package_flags
      throw new CliError(
        'init package 使用 --yes 时必须带 --template 与 --namespace',
        'INIT_PACKAGE_FLAGS',
      );
    }
    if (!typeCode) {
      // i18n: cli.init.type_required
      throw new CliError('请选择资源类型', 'INIT_TYPE_REQUIRED');
    }

    const created = createIdentity(targetDir, {
      subject: 'resource',
      name: normalizeName(path.basename(targetDir)),
      typeCode,
      ...(filePath ? { filePath } : {}),
    });
    repairIndex(targetDir);
    return created;
  });
}
