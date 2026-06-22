import { defineConfig } from 'vitest/config';

// Unit tests cover the pure logic (no electron/db/network). See *.test.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
