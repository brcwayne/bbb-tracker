import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
// style: false — plain scoped <style> blocks need no Vite CSS preprocessing;
// Svelte's compiler scopes them and vite-plugin-svelte still bundles them for build.
// Avoids vitest's `preprocessCSS ... Cannot create proxy` error on styled components.
export default { preprocess: vitePreprocess({ style: false }) }
