// Pre-package cleanup: kill any running instances of the app (which lock the
// previous build output) and remove the release/ directory so electron-builder
// starts from a clean slate. Cross-platform (win/mac/linux).
import { rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const PRODUCT_NAME = 'AI Interview Assistant'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = resolve(root, 'release')

function killRunningInstances() {
  if (process.platform === 'win32') {
    // /IM matches the image name; /F forces; /T also kills child processes.
    spawnSync('taskkill', ['/IM', `${PRODUCT_NAME}.exe`, '/F', '/T'], {
      stdio: 'ignore'
    })
  } else {
    // pkill -f matches against the full command line; safe no-op if none match.
    spawnSync('pkill', ['-f', PRODUCT_NAME], { stdio: 'ignore' })
  }
}

async function main() {
  killRunningInstances()
  // maxRetries/retryDelay ride out transient Windows locks (antivirus scanning a
  // freshly-built exe, lingering file handles) that otherwise throw EBUSY/EPERM.
  await rm(releaseDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
  console.log(`[clean-release] killed "${PRODUCT_NAME}" instances and removed ${releaseDir}`)
}

main().catch((err) => {
  console.error('[clean-release] failed:', err)
  process.exit(1)
})
