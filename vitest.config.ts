import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // pdf-parse's top-level index.js runs a debug self-test at import time
      // whenever `module.parent` is falsy (true under Vite/Vitest's module
      // loader), which crashes with ENOENT trying to read its own fixture
      // file. `lib/pdf-parse.js` exports the identical function without
      // that debug block, so tests import from there instead.
      'pdf-parse': path.resolve(__dirname, './node_modules/pdf-parse/lib/pdf-parse.js'),
    },
  },
  test: {
    environment: 'node',
  },
})
