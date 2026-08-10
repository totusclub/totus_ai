import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@tanstack/react-query'],
  treeshake: true,
  esbuildOptions(options) {
    // Preserve Next.js client boundary after bundling.
    options.banner = { js: '"use client";' }
    options.alias = {
      '@': './src',
    }
  },
})

