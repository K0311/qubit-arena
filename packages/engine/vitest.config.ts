import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'html'],
      // test-plan.md §1: engine coverage goal is ≥ 90 % lines.
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
