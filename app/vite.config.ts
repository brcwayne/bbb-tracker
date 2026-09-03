import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { svelteTesting } from '@testing-library/svelte/vite'

export default defineConfig({
  base: './',                    // Task 16'da GitHub Pages alt-yoluna çevrilecek
  plugins: [svelte(), svelteTesting()],
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    globals: true,
    setupFiles: ['./vitest-setup.ts'],
  },
})
