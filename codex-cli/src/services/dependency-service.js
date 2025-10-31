import { loadFreelogConfig, saveFreelogConfig } from './config-service.js';
import { fetchResource, fetchDependencySnapshot } from './remote-service.js';
import { promptSelect } from '../cli/prompts.js';
import { getOption, isOptionEnabled } from '../utils/options.js';
import { normalizeVersion } from '../utils/semver.js';

export async function addDependency(spec, options = {}) {
  const { identifier, version } = parseDependencySpecifier(spec);
  if (!identifier) {
    throw new Error('依赖格式应为 <资源>[@版本]。');
  }
  const remote = await fetchResource(identifier);
  if (!remote) {
    throw new Error(`未找到资源: ${identifier}`);
  }
  const targetVersion = version
    ? normalizeVersion(version)
    : remote.latestVersion ?? remote.versions?.[0] ?? '1.0.0';
  const policyId = await resolvePolicy(remote, options);

  const config = await loadFreelogConfig();
  const existingIndex = config.dependencies.findIndex(
    (item) => item.resourceId === remote.resourceId || item.name === remote.name
  );
  const dependencyRecord = {
    resourceId: remote.resourceId,
    name: remote.name,
    version: targetVersion,
    versionRange: version ? targetVersion : `^${targetVersion}`,
    policyId,
    authStatus: options.authStatus ?? true
  };
  if (existingIndex >= 0) {
    config.dependencies[existingIndex] = dependencyRecord;
  } else {
    config.dependencies.push(dependencyRecord);
  }
  await saveFreelogConfig(config);
  return dependencyRecord;
}

export async function changeDependency(spec, options = {}) {
  const { identifier, version } = parseDependencySpecifier(spec);
  const config = await loadFreelogConfig();
  const index = config.dependencies.findIndex(
    (item) => item.name === identifier || item.resourceId === identifier
  );
  if (index < 0) {
    throw new Error(`本地未找到依赖: ${identifier}`);
  }
  if (version) {
    config.dependencies[index].version = normalizeVersion(version);
  }
  if (options.policyId) {
    config.dependencies[index].policyId = options.policyId;
  }
  if (options.authStatus !== undefined) {
    config.dependencies[index].authStatus = Boolean(options.authStatus);
  }
  await saveFreelogConfig(config);
  return config.dependencies[index];
}

export async function removeDependencies(specs = []) {
  const config = await loadFreelogConfig();
  const before = config.dependencies.length;
  config.dependencies = config.dependencies.filter(
    (item) => !specs.includes(item.name) && !specs.includes(item.resourceId)
  );
  const removed = before - config.dependencies.length;
  await saveFreelogConfig(config);
  return removed;
}

export async function updateDependencies(specs = [], options = {}) {
  const config = await loadFreelogConfig();
  const targets = specs.length > 0 ? specs : config.dependencies.map((dep) => dep.name);
  const touched = [];
  for (const spec of targets) {
    const { identifier, version } = parseDependencySpecifier(spec);
    const dep = config.dependencies.find(
      (item) => item.name === identifier || item.resourceId === identifier
    );
    if (!dep) {
      continue;
    }
    const remote = await fetchResource(dep.resourceId || dep.name);
    if (!remote) {
      continue;
    }
    const nextVersion = version
      ? normalizeVersion(version)
      : remote.latestVersion ?? remote.versions?.[0] ?? dep.version;
    dep.version = nextVersion;
    if (!version) {
      dep.versionRange = `^${nextVersion}`;
    }
    touched.push({ name: dep.name, version: nextVersion });
  }
  await saveFreelogConfig(config);
  return touched;
}

export async function listDependencies(options = {}) {
  if (isOptionEnabled(options, 'remote')) {
    const remotes = await fetchDependencySnapshot();
    return remotes;
  }
  const config = await loadFreelogConfig({ ensure: false });
  return config?.dependencies ?? [];
}

export async function syncDependencies(options = {}) {
  const snapshot = await fetchDependencySnapshot();
  const config = await loadFreelogConfig();
  if (isOptionEnabled(options, 'force', 'f')) {
    config.dependencies = snapshot.map((item) => ({ ...item, versionRange: `^${item.version}` }));
  } else {
    for (const remote of snapshot) {
      const existing = config.dependencies.find((item) => item.resourceId === remote.resourceId);
      if (existing) {
        existing.version = remote.version;
        existing.policyId = remote.policyId;
        existing.authStatus = remote.authStatus;
      } else {
        config.dependencies.push({
          ...remote,
          versionRange: `^${remote.version}`
        });
      }
    }
  }
  await saveFreelogConfig(config);
  return config.dependencies;
}

function parseDependencySpecifier(spec) {
  if (!spec) {
    return { identifier: null, version: null };
  }
  if (spec.includes('://')) {
    const [identifier, version] = spec.split('@');
    return { identifier, version: version ?? null };
  }
  const atIndex = spec.lastIndexOf('@');
  if (atIndex > 0) {
    return { identifier: spec.slice(0, atIndex), version: spec.slice(atIndex + 1) };
  }
  return { identifier: spec, version: null };
}

async function resolvePolicy(remote, options) {
  const provided = getOption(options, 'policy', 'policyId');
  if (provided) {
    const exists = remote.policies?.find((policy) => policy.policyId === provided);
    if (!exists) {
      throw new Error(`远端资源不支持该策略: ${provided}`);
    }
    return provided;
  }
  if (!Array.isArray(remote.policies) || remote.policies.length === 0) {
    return undefined;
  }
  if (remote.policies.length === 1 || !process.stdin.isTTY) {
    return remote.policies[0].policyId;
  }
  const selected = await promptSelect(
    `请选择 ${remote.name} 的授权策略`,
    remote.policies.map((policy) => ({
      value: policy.policyId,
      label: `${policy.name}${policy.authRequired ? '（需授权）' : ''}`
    }))
  );
  return selected;
}
