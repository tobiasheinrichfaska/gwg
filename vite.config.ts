import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { cspPlugin } from './tools/csp-plugin.ts';

export default defineConfig({
  plugins: [react(), viteSingleFile(), cspPlugin()],
  build: { modulePreload: { polyfill: false } },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'relay/**/*.test.ts'],
  },
});
