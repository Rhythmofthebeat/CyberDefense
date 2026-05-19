/**
 * Build standalone agent binaries using Node.js SEA (Single Executable Application)
 * Produces self-contained executables — no Node.js required on target machines.
 *
 * Requires Node.js 20+
 * Run: node scripts/build-agent-binary.mjs
 *
 * Output:
 *   dist/cyber-defense-agent-macos-arm64
 *   dist/cyber-defense-agent-macos-x64
 *   dist/cyber-defense-agent-linux-x64
 *   dist/cyber-defense-agent-win-x64.exe
 */
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const AGENT = path.join(ROOT, 'agent', 'agent.js')

if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true })

// Bundle agent + deps into a single file using esbuild
console.log('\n  Bundling agent...')
execSync(
  `npx esbuild ${AGENT} --bundle --platform=node --target=node20 --outfile=${DIST}/agent-bundle.cjs --format=cjs`,
  { stdio: 'inherit', cwd: ROOT }
)

// Create SEA config
const seaConfig = { main: `${DIST}/agent-bundle.cjs`, output: `${DIST}/agent.blob`, disableExperimentalSEAWarning: true }
fs.writeFileSync(`${DIST}/sea-config.json`, JSON.stringify(seaConfig, null, 2))

// Build for current platform using Node SEA
const platform = process.platform
const arch = process.arch
const ext = platform === 'win32' ? '.exe' : ''
const outName = `cyber-defense-agent-${platform}-${arch}${ext}`
const outPath = path.join(DIST, outName)

console.log(`\n  Building binary: ${outName}`)

// Generate blob
execSync(`node --experimental-sea-config ${DIST}/sea-config.json`, { stdio: 'inherit' })

// Copy node executable
const nodePath = process.execPath
fs.copyFileSync(nodePath, outPath)
fs.chmodSync(outPath, 0o755)

// Inject blob (macOS requires removing signature first)
if (platform === 'darwin') {
  try { execSync(`codesign --remove-signature "${outPath}"`, { stdio: 'pipe' }) } catch {}
}

execSync(
  `npx postject "${outPath}" NODE_SEA_BLOB "${DIST}/agent.blob" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 ${platform === 'darwin' ? '--macho-segment-name NODE_SEA' : ''}`,
  { stdio: 'inherit', cwd: ROOT }
)

// Re-sign on macOS (ad-hoc, works without Apple Developer account)
if (platform === 'darwin') {
  try { execSync(`codesign --sign - "${outPath}"`, { stdio: 'pipe' }) } catch {}
}

console.log(`\n  ✓ Binary built: dist/${outName}`)
console.log(`  Size: ${(fs.statSync(outPath).size / 1e6).toFixed(1)} MB`)
console.log('\n  To cross-compile for other platforms, use:')
console.log('    GitHub Actions (see .github/workflows/release.yml)')
console.log('    or Docker with matching platform images\n')
