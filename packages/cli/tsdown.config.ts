import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/bin/index.ts', 'src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  fixedExtension: false,
  // 私有 workspace Node adapter 必须随 CLI 一起发布，不能作为 npm 运行时依赖。
  deps: {
    alwaysBundle: ['@freelog-cli/tools-lib2', '@freelog-cli/tools-lib2/node'],
    // tools-lib 的传递依赖也属于 CLI 发行物，不维护易碎的逐项白名单。
    onlyBundle: false,
  },
});
