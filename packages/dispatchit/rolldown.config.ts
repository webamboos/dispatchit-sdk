import {defineConfig} from 'rolldown'
import {dts} from 'rolldown-plugin-dts'

export default defineConfig({
  input: {
    index: 'src/index.ts',
    'adapters/express': 'src/adapters/express.ts',
    'adapters/hono': 'src/adapters/hono.ts',
  },
  output: {
    dir: 'dist',
    format: 'es',
    preserveModules: true,
    preserveModulesRoot: 'src',
    cleanDir: true,
  },
  plugins: [dts({entry: ['src/**/*.ts', '!src/**/*.test.ts']})],
  external: /^[^./]/,
  platform: 'node',
  tsconfig: true,
})
