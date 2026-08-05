import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    browser: 'src/browser.ts',
    node: 'src/node.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: ['react', 'react-dom', 'html-react-parser', 'js-cookie'],
});
