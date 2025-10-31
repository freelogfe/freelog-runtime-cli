import { getEnv } from '../config/env.js';
import { httpGet } from './http-client.js';
import { getLogger } from './logger.js';

const FALLBACK_RESOURCES = [
  {
    resourceId: 'res_ui_001',
    name: 'freelog-ui-library',
    description: '官方 UI 组件库',
    versions: ['2.3.0', '2.2.1', '2.0.0', '1.5.0'],
    policies: [
      { policyId: 'policy_free', name: '免费使用', authRequired: false },
      { policyId: 'policy_plus', name: '专业版 (按月)', authRequired: true }
    ],
    latestVersion: '2.3.0'
  },
  {
    resourceId: 'res_service_002',
    name: 'data-service',
    description: '示例数据服务',
    versions: ['2.5.0', '2.3.1', '2.0.0', '1.0.0'],
    policies: [
      { policyId: 'policy_data_basic', name: '基础 (免费)', authRequired: false },
      { policyId: 'policy_data_pro', name: '企业版', authRequired: true }
    ],
    latestVersion: '2.5.0'
  },
  {
    resourceId: 'res_core_003',
    name: 'freelog-core',
    description: '核心运行时',
    versions: ['1.8.4', '1.8.0', '1.7.0'],
    policies: [{ policyId: 'policy_core', name: '免费', authRequired: false }],
    latestVersion: '1.8.4'
  }
];

const FALLBACK_DEPENDENCIES = [
  {
    resourceId: 'res_ui_001',
    name: 'freelog-ui-library',
    version: '2.3.0',
    policyId: 'policy_free',
    authStatus: true
  },
  {
    resourceId: 'res_service_002',
    name: 'data-service',
    version: '2.3.1',
    policyId: 'policy_data_basic',
    authStatus: true
  }
];

async function tryRemote(call) {
  if (getEnv('FREELOG_CLI_OFFLINE')) {
    return null;
  }
  const logger = await getLogger();
  try {
    return await call();
  } catch (error) {
    logger.warn(`远端接口不可用，自动使用离线数据。错误: ${error.message}`);
    return null;
  }
}

export async function fetchResource(identifier) {
  const normalized = identifier?.toLowerCase();
  if (!normalized) {
    return null;
  }
  const remote = await tryRemote(() =>
    httpGet(getEnv('FREELOG_DEPENDENCY_ENDPOINT'), { params: { identifier } })
  );
  if (remote) {
    return remote;
  }
  return (
    FALLBACK_RESOURCES.find(
      (resource) =>
        resource.resourceId.toLowerCase() === normalized ||
        resource.name.toLowerCase() === normalized ||
        resource.name.replace(/\s+/g, '-').toLowerCase() === normalized
    ) ?? null
  );
}

export async function listAvailableResources() {
  const remote = await tryRemote(() => httpGet(`${getEnv('FREELOG_DEPENDENCY_ENDPOINT')}/catalog`));
  if (remote && Array.isArray(remote)) {
    return remote;
  }
  return FALLBACK_RESOURCES.map((resource) => ({
    resourceId: resource.resourceId,
    name: resource.name,
    description: resource.description,
    latestVersion: resource.latestVersion
  }));
}

export async function fetchDependencySnapshot() {
  const remote = await tryRemote(() => httpGet(`${getEnv('FREELOG_DEPENDENCY_ENDPOINT')}/snapshot`));
  if (remote && Array.isArray(remote)) {
    return remote;
  }
  return FALLBACK_DEPENDENCIES;
}
