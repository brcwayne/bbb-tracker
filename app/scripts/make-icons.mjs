// Regenerates the PWA app icons in app/public/icons/.
// Run once from app/:  node scripts/make-icons.mjs
// Output is committed, so this only needs re-running when the brand mark changes.

import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const BG = '#17161c'
const FG = '#a9863f'

// `inset` shrinks the wordmark toward the centre so a maskable icon keeps its
// content inside the ~80% safe zone Android crops to.
const mark = (fontSize) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <text x="256" y="256" fill="${FG}"
        font-family="Helvetica, Arial, sans-serif" font-weight="700"
        font-size="${fontSize}" text-anchor="middle" dominant-baseline="central"
        letter-spacing="2">BBB</text>
</svg>`

const standard = Buffer.from(mark(188))
const maskable = Buffer.from(mark(132))

const targets = [
  { file: 'icon-192.png', svg: standard, size: 192 },
  { file: 'icon-512.png', svg: standard, size: 512 },
  { file: 'maskable-512.png', svg: maskable, size: 512 },
]

await mkdir(OUT_DIR, { recursive: true })
for (const { file, svg, size } of targets) {
  const path = join(OUT_DIR, file)
  await sharp(svg).resize(size, size).png().toFile(path)
  console.log(`wrote ${path} (${size}x${size})`)
}
