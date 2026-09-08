import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'bin/index': 'src/bin/index.ts',
  },
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  splitting: false,
  // tools-lib2 是私有工作区包，必须打进 npm CLI，不能让安装者解析它。
  noExternal: ['@freelog-cli/tools-lib2'],
  banner: {
    // 被捆绑的 tools-lib2 依赖含 CommonJS 动态 require；ESM CLI 用 Node 原生 require 兼容它。
    js: '#!/usr/bin/env node\nimport { createRequire } from "node:module";\nconst require = createRequire(import.meta.url);',
  },
});
