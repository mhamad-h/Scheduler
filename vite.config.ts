import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base` is relative so the build works on GitHub Pages under /<repo>/ as well as at a domain root.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  test: {
    include: ['src/**/*.test.ts', 'scraper/**/*.test.ts'],
  },
} as any);
