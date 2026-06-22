// Rasterize resources/icon.svg into the assets electron-builder needs:
//   resources/icon.png  (1024×1024 — used for mac/linux and ico generation)
//   resources/icon.ico  (multi-resolution Windows icon)
// Re-run after editing icon.svg:  npm run icon
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const res = (p) => resolve(root, 'resources', p)

async function main() {
  const svg = await readFile(res('icon.svg'))

  // Master 1024px PNG (electron-builder uses this for mac .icns / linux).
  await sharp(svg, { density: 384 }).resize(1024, 1024).png().toFile(res('icon.png'))

  // Windows .ico bundles several sizes so it stays crisp from taskbar to desktop.
  const sizes = [256, 128, 64, 48, 32, 16]
  const pngBuffers = await Promise.all(
    sizes.map((s) => sharp(svg, { density: 384 }).resize(s, s).png().toBuffer()),
  )
  await writeFile(res('icon.ico'), await pngToIco(pngBuffers))

  console.log('[generate-icon] wrote resources/icon.png and resources/icon.ico')
}

main().catch((err) => {
  console.error('[generate-icon] failed:', err)
  process.exit(1)
})
