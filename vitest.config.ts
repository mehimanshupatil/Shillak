import { resolve } from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Run west of UTC on purpose. Stored dates are midnight UTC, so a formatter
    // that forgets timeZone:'UTC' prints the previous day — which is invisible
    // in a UTC or IST test run, and very visible to a user in New York.
    env: { TZ: 'America/New_York' },
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**', 'src/**/*.d.ts'],
      all: true,
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
