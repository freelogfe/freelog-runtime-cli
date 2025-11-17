export const DEFAULT_FREELOG_CONFIG = {
  version: '1.0.0',
  local: {
    buildDir: './dist',
    entryFile: './dist/index.html',
    excludes: ['node_modules', '.git', '*.log'],
    includes: ['dist/**/*', 'public/**/*']
  },
  resource: {
    resourceId: '',
    resourceName: '',
    resourceType: 'widget',
    coverImages: [],
    description: '',
    tags: []
  },
  properties: [],
  customOptions: [],
  dependencies: [],
  changelog: {
    '1.0.0': '初始版本'
  },
  scripts: {
    build: 'npm run build',
    dev: 'npm run dev',
    publish: 'freelog-cli publish'
  },
  meta: {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    author: ''
  }
};
