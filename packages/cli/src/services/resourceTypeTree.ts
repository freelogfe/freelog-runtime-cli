/** 平台 listSimpleByGroup 返回的资源类型节点（树形） */
export interface ResourceTypeNode {
  code: string;
  name: string;
  parentCode?: string;
  category?: number;
  children?: ResourceTypeNode[];
  [key: string]: unknown;
}

function nodeCode(row: Record<string, unknown>): string {
  return String(row.code || row.resourceTypeCode || row.typeCode || '').trim();
}

function nodeName(row: Record<string, unknown>): string {
  return String(row.name || row.resourceTypeName || row.title || row.typeName || '').trim();
}

/** 从 API 响应 flatten 或保留顶层树 */
export function parseResourceTypeForest(value: unknown): ResourceTypeNode[] {
  const roots: ResourceTypeNode[] = [];

  const toNode = (raw: Record<string, unknown>): ResourceTypeNode | null => {
    const code = nodeCode(raw);
    if (!code) return null;
    const childrenRaw = raw.children ?? raw.childNodes ?? raw.dataList;
    let children: ResourceTypeNode[] | undefined;
    if (Array.isArray(childrenRaw) && childrenRaw.length) {
      children = childrenRaw
        .map((item) => (item && typeof item === 'object' ? toNode(item as Record<string, unknown>) : null))
        .filter((item): item is ResourceTypeNode => Boolean(item));
      if (!children.length) children = undefined;
    }
    return {
      ...raw,
      code,
      name: nodeName(raw) || code,
      parentCode: raw.parentCode ? String(raw.parentCode) : undefined,
      children,
    };
  };

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as Record<string, unknown>;
    if (nodeCode(record)) {
      const parsed = toNode(record);
      if (parsed) roots.push(parsed);
      return;
    }
    for (const key of ['children', 'childNodes', 'dataList', 'list', 'data']) {
      visit(record[key]);
    }
  };

  visit(value);
  return dedupeRoots(roots);
}

function dedupeRoots(nodes: ResourceTypeNode[]): ResourceTypeNode[] {
  const seen = new Set<string>();
  const out: ResourceTypeNode[] = [];
  for (const node of nodes) {
    if (seen.has(node.code)) continue;
    seen.add(node.code);
    out.push(node);
  }
  return out;
}

export function flattenResourceTypes(nodes: ResourceTypeNode[]): ResourceTypeNode[] {
  const out: ResourceTypeNode[] = [];
  const walk = (list: ResourceTypeNode[]) => {
    for (const node of list) {
      out.push(node);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export function findTypePath(
  target: ResourceTypeNode,
  roots: ResourceTypeNode[],
): ResourceTypeNode[] | null {
  const path: ResourceTypeNode[] = [];
  const dfs = (nodes: ResourceTypeNode[]): boolean => {
    for (const node of nodes) {
      path.push(node);
      if (node.code === target.code) return true;
      if (node.children?.length && dfs(node.children)) return true;
      path.pop();
    }
    return false;
  };
  return dfs(roots) ? [...path] : null;
}

export function isLeafType(node: ResourceTypeNode): boolean {
  return !node.children?.length;
}

export function formatTypePath(path: ResourceTypeNode[]): string {
  return path.map((n) => n.name).join(' > ');
}

/** manifest.resourceType 数组采用叶子名在前、祖先名在后的稳定顺序。 */
export function buildResourceTypeLabels(path: ResourceTypeNode[]): string[] {
  if (!path.length) return [];
  const labels = [path[path.length - 1]!.name];
  for (let i = 0; i < path.length - 1; i++) {
    labels.push(path[i]!.name);
  }
  return labels;
}

export function searchResourceTypes(all: ResourceTypeNode[], keyword: string): ResourceTypeNode[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [];
  return flattenResourceTypes(all).filter(
    (node) => node.name.toLowerCase().includes(kw) || node.code.toLowerCase().includes(kw),
  );
}

/** 按展示名筛选类型候选，不写死环境相关 type code。 */
export type ScaffoldPreset = 'theme' | 'widget' | 'package';

export const SCAFFOLD_RESOURCE_TYPE_NAMES: Record<ScaffoldPreset, string[]> = {
  theme: ['主题'],
  widget: ['插件'],
  package: ['前端库', '软件库'],
};

export const SCAFFOLD_RESOURCE_TYPE_CODE_HINTS: Record<ScaffoldPreset, string[]> = {
  theme: ['theme'],
  widget: ['widget'],
  package: ['package', 'library', 'lib', 'software'],
};

export const PACKAGE_TEMPLATE_RESOURCE_TYPE_NAMES: Record<string, string[]> = {
  'package-js': ['JS工具包'],
  'package-react': ['组件库'],
  'package-vue': ['组件库'],
};

function codeMatchesHint(code: string, hints: string[]): boolean {
  const c = code.trim().toLowerCase();
  return hints.some((hint) => {
    const h = hint.toLowerCase();
    return c === h || c.includes(h);
  });
}

function narrowCandidates(
  candidates: ResourceTypeNode[],
  hints: string[],
): ResourceTypeNode[] {
  if (candidates.length <= 1) return candidates;

  const leaves = candidates.filter(isLeafType);
  if (leaves.length === 1) return leaves;
  if (leaves.length > 1) candidates = leaves;

  if (candidates.length <= 1) return candidates;

  const hinted = candidates.filter((node) => codeMatchesHint(node.code, hints));
  if (hinted.length === 1) return hinted;
  if (hinted.length > 1) return hinted;

  return candidates;
}

function findCandidatesByName(all: ResourceTypeNode[], name: string): ResourceTypeNode[] {
  return all.filter((node) => node.name === name);
}

function resolvePackageLeafCandidates(
  roots: ResourceTypeNode[],
  templateId?: string,
): ResourceTypeNode[] {
  const leaves = roots.flatMap((root) => flattenResourceTypes([root])).filter(isLeafType);
  if (!templateId) {
    if (leaves.length > 1) {
      throw new Error(
        `平台类型树中存在多个 package 叶子候选，须通过模板或 --resource-type 明确定稿：${leaves
          .map((node) => `${node.name} (${node.code})`)
          .join('；')}`,
      );
    }
    return leaves;
  }

  const preferredNames = PACKAGE_TEMPLATE_RESOURCE_TYPE_NAMES[templateId];
  if (!preferredNames) {
    throw new Error(
      `package 模板 ${templateId} 未声明对应的平台叶子类型，请显式传 --resource-type <code>`,
    );
  }

  const matched = leaves.filter((node) => preferredNames.includes(node.name));
  if (!matched.length) {
    throw new Error(
      `平台类型树中未找到 package 模板 ${templateId} 对应的叶子类型「${preferredNames.join('/')}」`,
    );
  }
  return matched;
}

/** 从平台类型树解析主题/插件/前端库定稿类型（唯一匹配才返回） */
export function resolveScaffoldResourceTypeFromForest(
  forest: ResourceTypeNode[],
  preset: ScaffoldPreset,
  opts?: { templateId?: string },
): { node: ResourceTypeNode; path: ResourceTypeNode[] } {
  const names = SCAFFOLD_RESOURCE_TYPE_NAMES[preset];
  const hints = SCAFFOLD_RESOURCE_TYPE_CODE_HINTS[preset];
  const all = flattenResourceTypes(forest);

  // package 入口优先“前端库”，其次“软件库”。
  for (const name of names) {
    let candidates = findCandidatesByName(all, name);
    if (!candidates.length) continue;
    if (preset === 'package') {
      candidates = resolvePackageLeafCandidates(candidates, opts?.templateId);
    }
    candidates = narrowCandidates(candidates, hints);
    if (candidates.length === 1) {
      const node = candidates[0]!;
      const path = findTypePath(node, forest) || [node];
      return { node, path };
    }
    if (candidates.length > 1) {
      const detail = candidates
        .map((node) => {
          const path = findTypePath(node, forest);
          return path ? `${formatTypePath(path)} (${node.code})` : `${node.name} (${node.code})`;
        })
        .join('；');
      throw new Error(`平台类型树中存在多个「${name}」候选，无法自动定稿：${detail}`);
    }
  }

  const codeCandidates = all.filter((node) => codeMatchesHint(node.code, hints));
  const narrowed = narrowCandidates(codeCandidates, hints);
  if (narrowed.length === 1) {
    const node = narrowed[0]!;
    const path = findTypePath(node, forest) || [node];
    return { node, path };
  }

  const presetLabel = names.join('/');
  if (!codeCandidates.length) {
    throw new Error(
      `平台类型树中未找到「${presetLabel}」对应资源类型，请先 freelog-cli login --env dev 后重试`,
    );
  }
  if (narrowed.length > 1) {
    const detail = narrowed
      .map((node) => {
        const path = findTypePath(node, forest);
        return path ? `${formatTypePath(path)} (${node.code})` : `${node.name} (${node.code})`;
      })
      .join('；');
    throw new Error(
      `平台类型树中存在多个「${presetLabel}」候选，无法自动定稿：${detail}`,
    );
  }

  throw new Error(
    `平台类型树中未找到「${presetLabel}」对应资源类型，请先 freelog-cli login --env dev 后重试`,
  );
}

export function findTypeInForestByCode(
  forest: ResourceTypeNode[],
  code: string,
): { node: ResourceTypeNode; path: ResourceTypeNode[] } | null {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const node = flattenResourceTypes(forest).find((item) => item.code === trimmed);
  if (!node) return null;
  const path = findTypePath(node, forest) || [node];
  return { node, path };
}
