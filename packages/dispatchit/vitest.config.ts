import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    name: 'customer-sdk',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
  },
})
