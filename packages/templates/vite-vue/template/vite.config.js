import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [basicSsl(), vue()],
  server: {
    port: 8002,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
})
