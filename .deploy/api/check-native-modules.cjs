// API readiness does not load the lazy JavaScript sandbox or image processor.
// Check their native bindings in the final image before publishing it.
const assert = require('node:assert/strict')

async function main() {
  const ivm = require('isolated-vm')
  const isolate = new ivm.Isolate({ memoryLimit: 16 })
  try {
    const context = await isolate.createContext()
    try {
      assert.equal(await context.eval('21 * 2', { timeout: 1000 }), 42)
    } finally {
      context.release()
    }
  } finally {
    isolate.dispose()
  }
  console.log('isolated-vm execution passed')

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
