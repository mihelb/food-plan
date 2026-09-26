import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative paths so the built index.html loads via file:// inside Electron.
  base: './',
  build: { outDir: 'dist' },
  test: { globals: true, environment: 'node' },
});
