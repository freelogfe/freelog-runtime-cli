import { loadFreelogConfig, saveFreelogConfig } from './config-service.js';
import { fetchResource, fetchDependencySnapshot } from './remote-service.js';

export async function syncProject({ resourceSpec = null, options = {} } = {}) {
  const config = await loadFreelogConfig();
  const summary = {
    resourceUpdated: false,
    dependenciesUpdated: false,
    propertiesUpdated: false,
    configUpdated: false,
    changelogUpdated: false
  };

  if (resourceSpec) {
    const { identifier, version } = parseResourceSpecifier(resourceSpec);
    const remote = await fetchResource(identifier);
    if (!remote) {
      throw new Error(`未找到作品: ${identifier}`);
    }
    config.resource = {
      ...config.resource,
      resourceId: remote.resourceId,
      resourceName: remote.name,
      resourceType: remote.resourceType ?? 'widget',
      description: remote.description,
      tags: remote.tags ?? ['freelog']
    };
    config.version = version ?? remote.latestVersion ?? config.version ?? '1.0.0';
    summary.resourceUpdated = true;
  }

  if (shouldUpdateDependencies(options)) {
    const snapshot = await fetchDependencySnapshot();
    config.dependencies = snapshot.map((item) => ({ ...item, versionRange: `^${item.version}` }));
    summary.dependenciesUpdated = true;
  }

  if (options.props || options.all) {
    config.properties = config.properties?.length
      ? config.properties
      : [
          {
            key: 'theme',
            name: '主题',
            type: 'select',
            default: 'light',
            options: ['light', 'dark'],
            description: 'UI 主题切换'
          }
        ];
    summary.propertiesUpdated = true;
  }

  if (options.config || options.all) {
    config.local = {
      buildDir: './dist',
      entryFile: './dist/index.html',
      excludes: ['node_modules', '*.log', '.git'],
      includes: ['dist/**/*']
    };
    summary.configUpdated = true;
  }

  if (options.changelog || options.all) {
    config.changelog = {
      ...(config.changelog ?? {}),
      [config.version ?? '1.0.0']: '同步远端信息'
    };
    summary.changelogUpdated = true;
  }

  await saveFreelogConfig(config);
  return summary;
}

function parseResourceSpecifier(spec) {
  if (!spec) {
    return { identifier: null, version: null };
  }
  const atIndex = spec.lastIndexOf('@');
  if (atIndex > 0) {
    return { identifier: spec.slice(0, atIndex), version: spec.slice(atIndex + 1) };
  }
  return { identifier: spec, version: null };
}

function shouldUpdateDependencies(options) {
  if (options.dependencies || options.all) {
    return true;
  }
  const flags = ['props', 'config', 'changelog'];
  return !flags.some((flag) => options[flag]);
}
