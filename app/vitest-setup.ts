import '@testing-library/jest-dom/vitest'

// Polyfill localStorage for jsdom environment
if (typeof globalThis !== 'undefined' && !globalThis.localStorage) {
  const store: Record<string, string> = {}
  ;(globalThis as any).localStorage = {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      Object.keys(store).forEach(key => delete store[key])
    },
    length: Object.keys(store).length,
    key: (index: number) => Object.keys(store)[index] || null,
  } as any
}
