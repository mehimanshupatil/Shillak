/**
 * Generate PWA icon PNGs from public/icon.svg
 * Run once: node scripts/gen-icons.mjs
 */
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dir, '..')
const svgPath = resolve(root, 'public/icon.svg')
const svg = readFileSync(svgPath)

mkdirSync(resolve(root, 'public/icons'), { recursive: true })

const icons = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'icon-maskable.png', size: 512 },
]

for (const { file, size } of icons) {
  await sharp(svg, { density: Math.round((size / 40) * 72) })
    .resize(size, size)
    .png()
    .toFile(resolve(root, 'public/icons', file))
  console.log(`✓ public/icons/${file}`)
}
