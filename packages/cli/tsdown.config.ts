import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/bin/index.ts', 'src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  // 必须 external：由 platform/tools-lib.ts 在 shim 后 createRequire 加载
  external: ['@freelog/tools-lib'],
});
