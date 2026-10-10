import type { StatusPayload } from './statusService.js';

export interface StartTask {
  id:
    | 'publish-new'
    | 'update-local'
    | 'maintain-online'
    | 'batch-import'
    | 'collection'
    | 'policy-online'
    | 'session-studio';
  label: string;
  description: string;
  nextCommands: string[];
}

export interface StartGuide {
  summary: {
    hasResourceProject: boolean;
    hasCollectionProject: boolean;
    hasVersionIntent: boolean;
    loggedIn: boolean;
    environment: string;
    resourceId?: string | null;
    collectionId?: string | null;
  };
  recommendedTaskId: StartTask['id'];
  tasks: StartTask[];
}

function task(
  id: StartTask['id'],
  label: string,
  description: string,
  nextCommands: string[],
): StartTask {
  return { id, label, description, nextCommands };
}

export function buildStartGuide(status: StatusPayload): StartGuide {
  const hasResourceProject = Boolean(status.configs.resource);
  const hasCollectionProject = Boolean(status.configs.collection);
  const hasVersionIntent = Boolean(status.configs.version);
  const envSuffix = `--env ${status.environment}`;

  const tasks: StartTask[] = [
    task('publish-new', '发布一个新资源', '主题、插件、package、普通文件、普通目录 zip', [
      `freelog-cli init theme <目录> ${envSuffix}`,
      `freelog-cli init widget <目录> ${envSuffix}`,
      `freelog-cli init package <目录> ${envSuffix}`,
      `freelog-cli init <目录> --scaffold none --resource-type <leaf-code> --artifact-mode <file|directory-zip> ${envSuffix}`,
    ]),
    task('update-local', '更新当前本地工程', '读取 manifest/state，继续 build、publish、policy、online', [
      `freelog-cli status ${envSuffix}`,
      `freelog-cli release --build-cmd "<构建命令>" --bump patch --yes ${envSuffix}`,
      `freelog-cli policy template list ${envSuffix}`,
      `freelog-cli online --yes ${envSuffix}`,
    ]),
    task('maintain-online', '维护一个已有线上资源', '不创建本地工程，按 resourceId 临时维护', [
      `freelog-cli session ${envSuffix}`,
      `freelog-cli bind <resourceId> --yes ${envSuffix}`,
      `freelog-cli policy template apply <templateId> --session --resource-id <resourceId> --yes ${envSuffix}`,
    ]),
    task('batch-import', '批量发布一个本地文件夹', '扫描目录，预览，分批写平台，生成 report', [
      `freelog-cli resource import-dir <目录> --resource-type <leaf-code> --yes --json-lines ${envSuffix}`,
    ]),
    task('collection', '创建或维护合集', '合集壳、目录草稿、RSS、collect-rules、publish、online', [
      `freelog-cli init <目录> --scaffold collection --resource-type <collection-code> ${envSuffix}`,
      `freelog-cli collection create --yes ${envSuffix}`,
      `freelog-cli collection rss inspect <feed-url> ${envSuffix}`,
      `freelog-cli collection collect-rules get ${envSuffix}`,
    ]),
    task('policy-online', '只管理策略 / 依赖 / 上下架', '不发布文件，只维护线上状态', [
      `freelog-cli policy template list ${envSuffix}`,
      `freelog-cli policy template apply <templateId> --yes ${envSuffix}`,
      `freelog-cli dep auth --yes ${envSuffix}`,
      `freelog-cli online --yes ${envSuffix}`,
      `freelog-cli offline --yes ${envSuffix}`,
    ]),
    task('session-studio', '进入 session / studio 临时工作', 'session 不落盘；studio 支持多账号和子工程', [
      `freelog-cli session ${envSuffix}`,
      `freelog-cli studio ${envSuffix}`,
    ]),
  ];

  const recommendedTaskId: StartTask['id'] = hasCollectionProject
    ? 'collection'
    : hasResourceProject || hasVersionIntent
      ? 'update-local'
      : 'publish-new';

  return {
    summary: {
      hasResourceProject,
      hasCollectionProject,
      hasVersionIntent,
      loggedIn: status.loggedIn,
      environment: status.environment,
      resourceId: status.local.resourceId,
      collectionId: status.collection?.resourceId,
    },
    recommendedTaskId,
    tasks,
  };
}
