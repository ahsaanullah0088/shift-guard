import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // tsup sets `baseUrl` internally for declaration builds, which TypeScript 6 deprecates.
  dts: { compilerOptions: { ignoreDeprecations: '6.0' } },
  sourcemap: true,
  clean: true,
  // Browsers and edge runtimes are targets too, not only Node 24.
  target: 'es2022',
  treeshake: true,
})
