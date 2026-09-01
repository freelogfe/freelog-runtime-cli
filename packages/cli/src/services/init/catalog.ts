import type { ScaffoldInitCategory } from './picker.js';

export type InitScaffold = 'runtime' | 'package' | 'none' | 'collection';

/** init 第一层与 Console 创建向导保持五类业务入口。 */
export const INIT_CATEGORY_META: Record<
  ScaffoldInitCategory,
  {
    label: string;
    scaffold: InitScaffold;
    fixedTypeNames?: string[];
    needsTemplate: boolean;
    needsRuntime: boolean;
    needsNamespace: boolean;
    defaultVersionFilePath: string;
  }
> = {
  theme: {
    label: '主题',
    scaffold: 'runtime',
    fixedTypeNames: ['主题'],
    needsTemplate: true,
    needsRuntime: true,
    needsNamespace: false,
    defaultVersionFilePath: 'dist',
  },
  widget: {
    label: '插件',
    scaffold: 'runtime',
    fixedTypeNames: ['插件'],
    needsTemplate: true,
    needsRuntime: true,
    needsNamespace: false,
    defaultVersionFilePath: 'dist',
  },
  package: {
    label: '前端库/软件库',
    scaffold: 'package',
    fixedTypeNames: ['前端库', '软件库'],
    needsTemplate: true,
    needsRuntime: false,
    needsNamespace: true,
    defaultVersionFilePath: 'dist',
  },
  other: {
    label: '其余资源',
    scaffold: 'none',
    needsTemplate: false,
    needsRuntime: false,
    needsNamespace: false,
    defaultVersionFilePath: '',
  },
  collection: {
    label: '合集',
    scaffold: 'collection',
    needsTemplate: false,
    needsRuntime: false,
    needsNamespace: false,
    defaultVersionFilePath: '',
  },
};

const COMPRESS_CODE_HINTS = ['theme', 'widget', 'package', 'library', 'lib'];

export function inferCategoryFromTypeCode(code: string): ScaffoldInitCategory | undefined {
  const c = code.trim().toLowerCase();
  if (c === 'theme') return 'theme';
  if (c === 'widget') return 'widget';
  if (c.includes('package') || c.includes('library') || c.includes('lib')) return 'package';
  return undefined;
}

export function scaffoldForCategory(category: ScaffoldInitCategory): InitScaffold {
  return INIT_CATEGORY_META[category].scaffold;
}

export function resolveScaffold(opts: {
  category?: ScaffoldInitCategory;
  scaffold?: InitScaffold;
  resourceTypeCode?: string;
}): InitScaffold {
  if (opts.scaffold) return opts.scaffold;
  if (opts.category) return scaffoldForCategory(opts.category);
  const inferred = opts.resourceTypeCode
    ? inferCategoryFromTypeCode(opts.resourceTypeCode)
    : undefined;
  if (inferred) return scaffoldForCategory(inferred);
  return 'none';
}

export function assertScaffoldCategoryMatch(opts: {
  scaffold: InitScaffold;
  category: ScaffoldInitCategory;
}): void {
  const expected = INIT_CATEGORY_META[opts.category].scaffold;
  if (opts.scaffold === expected) return;
  // 允许 none 接入已有主题/插件工程
  if (opts.scaffold === 'none' && (opts.category === 'theme' || opts.category === 'widget')) {
    return;
  }
  if (opts.scaffold === 'runtime' && opts.category === 'package') {
    throw new Error(
      `资源大类为「前端库/软件库」时不应使用 --scaffold runtime，请用 --scaffold package`,
    );
  }
  if (opts.scaffold === 'package' && (opts.category === 'theme' || opts.category === 'widget')) {
    throw new Error(
      `资源大类为「${INIT_CATEGORY_META[opts.category].label}」时不应使用 --scaffold package，请用 --scaffold runtime`,
    );
  }
  if (opts.scaffold !== expected) {
    throw new Error(
      `资源大类「${INIT_CATEGORY_META[opts.category].label}」应使用 --scaffold ${expected}，当前为 ${opts.scaffold}`,
    );
  }
}

export function defaultVersionFilePath(opts: {
  category: ScaffoldInitCategory;
  resourceTypeCode: string;
  scaffold: InitScaffold;
}): string {
  if (opts.scaffold === 'runtime' || opts.scaffold === 'package') {
    return 'dist';
  }
  const code = opts.resourceTypeCode.toLowerCase();
  if (opts.category === 'theme' || opts.category === 'widget' || opts.category === 'package') {
    return 'dist';
  }
  if (COMPRESS_CODE_HINTS.some((h) => code.includes(h))) {
    return 'dist';
  }
  return '';
}

export function initNextSteps(opts: {
  scaffold: InitScaffold;
  category: ScaffoldInitCategory;
  projectDir: string;
}): string[] {
  const lines: string[] = [];
  const explicitArtifactMode = opts.scaffold === 'none'
    ? ' --artifact-mode <file|directory-zip>'
    : '';
  if (opts.scaffold === 'runtime' || opts.scaffold === 'package') {
    lines.push(`cd ${opts.projectDir}`);
    lines.push('pnpm install && pnpm build');
  }
  lines.push('freelog-cli login --env dev');
  lines.push('freelog-cli create --yes --env dev');
  if (opts.category === 'theme' || opts.category === 'widget') {
    lines.push(
      `freelog-cli version set --version 1.0.0 --file dist --runtime 0.5${explicitArtifactMode} --env dev`,
    );
  } else if (opts.category === 'package') {
    lines.push(`freelog-cli version set --version 1.0.0 --file dist${explicitArtifactMode} --env dev`);
  } else if (opts.category === 'other') {
    lines.push(`freelog-cli version set --version 1.0.0 --file <你的文件路径>${explicitArtifactMode} --env dev`);
  } else if (opts.category === 'collection') {
    lines.push('freelog-cli collection create --yes --env dev');
    lines.push('freelog-cli collection item import-dir <媒体目录> --resource-type <条目类型> --env dev');
    lines.push('freelog-cli collection version set --description "首版" --env dev');
    lines.push('freelog-cli collection publish --yes --env dev');
    lines.push('freelog-cli collection policy template list --env dev');
    lines.push('freelog-cli collection policy template apply <templateId> --yes --env dev');
    lines.push('freelog-cli online --yes --env dev');
    return lines;
  }
  lines.push('freelog-cli publish --yes --env dev');
  lines.push('freelog-cli policy template list --env dev');
  lines.push('freelog-cli policy template apply <templateId> --yes --env dev');
  lines.push('freelog-cli online --yes --env dev');
  return lines;
}

/** runtime 模板 id → 用户可读名称。 */
export const TEMPLATE_DISPLAY_NAMES: Record<string, string> = {
  'vite-vue-ts': 'freelog主题-vite-vue-ts',
  'vite-vue': 'freelog主题-vite-vue',
  'vite-react-ts': 'freelog主题-vite-react-ts',
  'vite-react': 'freelog主题-vite-react',
  'package-js': 'freelog前端库-package-js',
  'package-react': 'freelog前端库-package-react',
  'package-vue': 'freelog前端库-package-vue',
};
