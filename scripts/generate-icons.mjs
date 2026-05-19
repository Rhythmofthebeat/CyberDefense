/**
 * Generates extension icons as PNG using Node canvas.
 * Run: node scripts/generate-icons.mjs
 * Requires: npm install canvas (in project root)
 */
import { createCanvas } from 'canvas'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '../extension/icons')
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

function drawIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Background
  const bg = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2)
  bg.addColorStop(0, '#0a1628')
  bg.addColorStop(1, '#040a14')
  ctx.fillStyle = bg
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, size * 0.18)
  ctx.fill()

  // Shield shape
  const cx = size / 2
  const cy = size * 0.48
  const sw = size * 0.52
  const sh = size * 0.60

  ctx.beginPath()
  ctx.moveTo(cx, cy - sh/2)
  ctx.lineTo(cx + sw/2, cy - sh/2 + sh*0.22)
  ctx.lineTo(cx + sw/2, cy + sh*0.08)
  ctx.quadraticCurveTo(cx + sw/2, cy + sh/2, cx, cy + sh/2)
  ctx.quadraticCurveTo(cx - sw/2, cy + sh/2, cx - sw/2, cy + sh*0.08)
  ctx.lineTo(cx - sw/2, cy - sh/2 + sh*0.22)
  ctx.closePath()

  const grad = ctx.createLinearGradient(cx - sw/2, cy - sh/2, cx + sw/2, cy + sh/2)
  grad.addColorStop(0, '#1e90ff')
  grad.addColorStop(1, '#0984e3')
  ctx.fillStyle = grad
  ctx.fill()

  // Glow
  ctx.shadowColor = '#1e90ff'
  ctx.shadowBlur = size * 0.1
  ctx.strokeStyle = '#74b9ff'
  ctx.lineWidth = size * 0.03
  ctx.stroke()
  ctx.shadowBlur = 0

  // Checkmark / lock icon inside shield
  if (size >= 32) {
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = size * 0.06
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - sw*0.2, cy + sh*0.02)
    ctx.lineTo(cx - sw*0.04, cy + sh*0.18)
    ctx.lineTo(cx + sw*0.22, cy - sh*0.12)
    ctx.stroke()
  }

  return canvas.toBuffer('image/png')
}

for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(OUT, `icon${size}.png`), drawIcon(size))
  console.log(`  Generated icon${size}.png`)
}
console.log('Done.')
