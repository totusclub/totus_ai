import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  external: [
    'react',
    'react-native',
    'react/jsx-runtime',
    '@react-native-async-storage/async-storage',
  ],
  treeshake: true,
  esbuildOptions(options) {
    options.alias = {
      '@': './src',
    }
  },
})
