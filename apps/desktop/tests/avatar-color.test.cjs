const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const defaults = require('../electron/theme-defaults.json')

function loadColors() {
  const output = {}
  runInNewContext(
    ts.transpileModule(readFileSync(join(__dirname, '../src/avatar/color.ts'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
    }).outputText,
    {
      exports: output,
      require: (name) => {
        assert.equal(name, '../../electron/theme-defaults.json')
        return defaults
      }
    }
  )
  return output.avatarColorIndex
}

const avatarColorIndex = loadColors()

test('color remains tied to the Assistant across rename, duplicate entries and fresh runtimes', () => {
  const id = '00000000-0000-4000-8000-000000000042'
  const original = avatarColorIndex({ id, name: 'Original' })
  assert.equal(avatarColorIndex({ id, name: 'Renamed' }), original)
  assert.equal(avatarColorIndex({ id: 'local-copy-1', assistantId: id }), original)
  assert.equal(loadColors()({ id }), original, 'reloading must not randomly recolor the Assistant')
  const reversed = ['alice', 'bob', 'carol'].reverse().map((id) => [id, avatarColorIndex({ id })])
  for (const [id, color] of reversed) assert.equal(avatarColorIndex({ id }), color)
})

test('the stable palette contains ten distinct accessible colors and uses every slot', () => {
  assert.equal(defaults.avatarPalette.length, 10)
  assert.equal(new Set(defaults.avatarPalette).size, 10)
  const slots = new Set(Array.from({ length: 200 }, (_, i) => avatarColorIndex({ id: `assistant-${i}` })))
  assert.deepEqual(
    [...slots].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  )
  const luminance = (hex) => {
    const rgb = [1, 3, 5].map((offset) => {
      const c = parseInt(hex.slice(offset, offset + 2), 16) / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    })
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
  }
  for (const background of defaults.avatarPalette) {
    const l1 = luminance(defaults.avatarForeground),
      l2 = luminance(background)
    assert.ok(
      (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) >= 4.5,
      `${background} must keep facial features legible`
    )
  }
})
