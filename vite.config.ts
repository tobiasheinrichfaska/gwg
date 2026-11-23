import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { modulePreload: { polyfill: false } },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
