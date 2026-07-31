import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/bin/index.ts', 'src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  // tools-lib 由 CLI 的运行时依赖解析，避免把公共库内联进 CLI bundle。
  external: ['@freelog/tools-lib', '@freelog/tools-lib/node'],
});
