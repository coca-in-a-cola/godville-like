import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build can later be served from a GitHub project Pages path.
  base: './',
  plugins: [preact()],
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
