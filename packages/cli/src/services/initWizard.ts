import { consola } from 'consola';
import fs from 'node:fs';
import path from 'node:path';
import { requireAuth } from '../core/auth.js';
import { CliError } from '../core/errors.js';
import { isInteractive } from '../core/tty.js';
import { resolveCwd } from '../config/project.js';
import {
  assertScaffoldCategoryMatch,
  defaultVersionFilePath,
  inferCategoryFromTypeCode,
  INIT_CATEGORY_META,
  resolveScaffold,
  scaffoldForCategory,
  type InitScaffold,
} from './initCatalog.js';
import {
  pickInitNamespace,
  pickInitResourceIdentity,
  pickInitTemplate,
} from './initPrompts.js';
import { formatMediaDirHint, scanMediaDir } from './mediaDirScan.js';
import {
  buildResourceTypeLabels,
  findTypeInForestByCode,
  formatTypePath,
} from './resourceTypeTree.js';
import {
  loadResourceTypeForest,
  pickInitCategory,
  pickResourceTypeForCategory,
  resolveFixedScaffoldCategory,
  type PickedResourceType,
  type ScaffoldInitCategory,
  type ScaffoldPreset,
} from './resourceTypePicker.js';
import { assertResourceTypeCode } from './typeService.js';

export interface ResolvedInitArgs {
  scaffold: InitScaffold;
  resourceTypeCode: string;
  resourceTypeName?: string;
  resourceTypeLabels?: string[];
  category: ScaffoldInitCategory;
  template?: string;
  runtime?: '0.4' | '0.5';
  namespace?: string;
  resourceName?: string;
  title?: string;
  versionFilePath?: string;
}

export interface ResolvedInitOutcome {
  args: ResolvedInitArgs;
  dir: string;
}

function showMediaDirHintIfAny(cwd: string, dirArg: string): void {
  const target =
    dirArg === '.' ? cwd : path.isAbsolute(dirArg) ? dirArg : path.resolve(cwd, dirArg);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return;
  const hint = formatMediaDirHint(scanMediaDir(target));
  if (hint) consola.info(hint);
}

async function resolveTypePick(opts: {
  scaffold?: InitScaffold;
  resourceTypeCode?: string;
  category: ScaffoldInitCategory;
  presetCategory?: ScaffoldPreset;
}): Promise<PickedResourceType> {
  if (opts.presetCategory) {
    if (opts.resourceTypeCode?.trim()) {
      return pickedFromExplicitCode(
        opts.resourceTypeCode,
        opts.scaffold || scaffoldForCategory(opts.presetCategory),
      );
    }
    requireAuth();
    return resolveFixedScaffoldCategory(opts.presetCategory);
  }

  if (opts.resourceTypeCode?.trim()) {
    return pickedFromExplicitCode(opts.resourceTypeCode, opts.scaffold);
  }

  requireAuth();

  if (opts.category === 'theme' || opts.category === 'widget' || opts.category === 'package') {
    return resolveFixedScaffoldCategory(opts.category);
  }

  return pickResourceTypeForCategory(opts.category);
}

async function pickedFromExplicitCode(
  code: string,
  scaffold?: InitScaffold,
): Promise<PickedResourceType> {
  const trimmed = code.trim();
  await assertResourceTypeCode(trimmed);
  const inferred = inferCategoryFromTypeCode(trimmed);
  const category: ScaffoldInitCategory =
    inferred ||
    (scaffold === 'collection' ? 'collection' : scaffold === 'package' ? 'package' : 'other');

  try {
    const forest = await loadResourceTypeForest();
    const found = findTypeInForestByCode(forest, trimmed);
    if (found) {
      return {
        code: found.node.code,
        name: found.node.name,
        path: found.path,
        pathLabel: formatTypePath(found.path),
        resourceTypeLabels: buildResourceTypeLabels(found.path),
        category,
        suggestedScaffold: resolveScaffold({ category, scaffold, resourceTypeCode: trimmed }),
      };
    }
  } catch {
    // 显式 code 已校验过；类型树不可用时回退到 code 本身
  }

  return {
    code: trimmed,
    name: trimmed,
    path: [],
    pathLabel: trimmed,
    resourceTypeLabels: [],
    category,
    suggestedScaffold: resolveScaffold({ category, scaffold, resourceTypeCode: trimmed }),
  };
}

/**
 * 解析 init 工程立项参数（方案 A：仅 scaffold 路径，不含批量/文件夹合集）。
 */
export async function resolveInitOutcome(opts: {
  yes?: boolean;
  scaffold?: InitScaffold;
  resourceTypeCode?: string;
  presetCategory?: ScaffoldPreset;
  template?: string;
  runtime?: '0.4' | '0.5';
  namespace?: string;
  resourceName?: string;
  title?: string;
  dir?: string;
  cwd?: string;
}): Promise<ResolvedInitOutcome> {
  const args = await resolveInitArgsInteractive({
    ...opts,
    dir: String(opts.dir ?? '.'),
  });
  return { args, dir: String(opts.dir ?? '.') };
}

export async function resolveInitArgsInteractive(opts: {
  yes?: boolean;
  scaffold?: InitScaffold;
  resourceTypeCode?: string;
  category?: ScaffoldInitCategory;
  presetCategory?: ScaffoldPreset;
  template?: string;
  runtime?: '0.4' | '0.5';
  namespace?: string;
  resourceName?: string;
  title?: string;
  dir?: string;
  cwd?: string;
}): Promise<ResolvedInitArgs> {
  const cwd = resolveCwd(opts.cwd);
  const interactive = isInteractive(opts.yes);
  const dirArg = String(opts.dir ?? '.');

  let scaffold = opts.scaffold;
  let template = opts.template;
  let runtime = opts.runtime;
  let namespace = opts.namespace;
  let resourceName = opts.resourceName;
  let title = opts.title;

  let category = opts.category;
  if (opts.presetCategory) {
    category = opts.presetCategory;
  } else if (!category && opts.resourceTypeCode?.trim()) {
    category =
      inferCategoryFromTypeCode(opts.resourceTypeCode) ||
      (opts.scaffold === 'collection'
        ? 'collection'
        : opts.scaffold === 'package'
          ? 'package'
          : 'other');
  } else if (!category) {
    if (!interactive) {
      throw new CliError('非交互 init 必须提供 --resource-type 或使用 init theme|widget|package', {
        code: 4,
      });
    }
    if (dirArg !== '.') {
      showMediaDirHintIfAny(cwd, dirArg);
    }
    category = await pickInitCategory();
  }

  const picked = await resolveTypePick({
    scaffold,
    resourceTypeCode: opts.resourceTypeCode,
    category,
    presetCategory: opts.presetCategory,
  });

  scaffold = resolveScaffold({
    category,
    scaffold: scaffold || picked.suggestedScaffold,
    resourceTypeCode: picked.code,
  });

  try {
    assertScaffoldCategoryMatch({ scaffold, category });
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error), { code: 4 });
  }

  if (!opts.presetCategory) {
    await assertResourceTypeCode(picked.code);
  }

  const meta = INIT_CATEGORY_META[category];

  if (!interactive) {
    if ((scaffold === 'runtime' || scaffold === 'package') && !template) {
      throw new CliError('非交互 init 缺少 --template', {
        code: 4,
        hint: 'freelog-cli template list --scaffold runtime --runtime 0.5',
      });
    }
    if (scaffold === 'package' && !namespace) {
      throw new CliError('非交互 init 缺少 --namespace', { code: 4 });
    }
    if (scaffold === 'runtime' && !runtime) {
      runtime = '0.5';
    }
  } else {
    consola.success(`已选资源类型: ${picked.pathLabel} (${picked.code})`);

    if (meta.needsTemplate && !template) {
      template = await pickInitTemplate(scaffold as 'runtime' | 'package', runtime);
    }
    if (meta.needsRuntime && !runtime) {
      runtime = '0.5';
    }
    if (meta.needsNamespace && !namespace) {
      namespace = await pickInitNamespace();
    }

    const defaultDirName =
      dirArg && dirArg !== '.'
        ? dirArg.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '')
        : 'my-project';
    if (!resourceName || !title) {
      const identity = await pickInitResourceIdentity(resourceName || defaultDirName);
      resourceName = resourceName || identity.resourceName;
      title = title || identity.title;
    }
  }

  if (scaffold === 'runtime' && !runtime) {
    runtime = '0.5';
  }

  const versionFilePath = defaultVersionFilePath({
    category,
    resourceTypeCode: picked.code,
    scaffold,
  });

  return {
    scaffold,
    resourceTypeCode: picked.code,
    resourceTypeName: picked.name,
    resourceTypeLabels: picked.resourceTypeLabels,
    category,
    template,
    runtime,
    namespace,
    resourceName,
    title,
    versionFilePath,
  };
}
