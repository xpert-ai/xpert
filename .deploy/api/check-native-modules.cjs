// API readiness does not load the lazy JavaScript sandbox or image processor.
// Execute both dependencies in the final image before publishing it.
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { serialize } = require('node:v8')

async function main() {
  const worker =
    process.argv[2] || path.join(__dirname, '../../packages/server-ai/src/sandbox/commands/handlers/quickjs-worker.js')
  const output = execFileSync(process.execPath, [worker], {
    input: serialize({ parameters: { value: 21 }, code: 'return value * 2' }),
    encoding: 'utf8',
    timeout: 10000,
    killSignal: 'SIGKILL',
    env: {}
  })
  assert.equal(JSON.parse(output), 42)
  console.log('QuickJS worker execution passed')

  const sharp = require('sharp')
  const image = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 0, g: 0, b: 0 } }
  })
    .png()
    .toBuffer()
  const metadata = await sharp(image).metadata()
  assert.equal(metadata.format, 'png')
  assert.equal(metadata.width, 1)
  assert.equal(metadata.height, 1)
  console.log('sharp image processing passed')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
