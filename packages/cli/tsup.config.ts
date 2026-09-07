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
  banner: {
    js: '#!/usr/bin/env node',
  },
});
