const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { prepareChatkitEntry } = require('./prepare-chatkit-entry.cjs')

test('keeps installed bundle URLs and adds the local font stylesheet exactly once', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatkit-entry-'))
  try {
    const source = path.join(root, 'index.html')
    fs.writeFileSync(
      source,
      '<html><head><script type="module" src="/assets/index-hash.js"></script></head><body></body></html>'
    )
    const output = path.join(prepareChatkitEntry({ root, source }), 'index.html')
    assert.match(fs.readFileSync(output, 'utf8'), /src="\/assets\/index-hash.js"/)
    prepareChatkitEntry({ root, source: output })
    assert.equal(fs.readFileSync(output, 'utf8').match(/href="\/assets\/chatkit-icons\/remixicon.css"/g).length, 1)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('fails instead of publishing an invalid installed entry', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatkit-entry-'))
  try {
    const source = path.join(root, 'index.html')
    fs.writeFileSync(source, '<body>incomplete entry</body>')
    assert.throws(() => prepareChatkitEntry({ root, source }), /missing its head element/)
    assert.equal(fs.existsSync(path.join(root, '.cache/chatkit-entry/index.html')), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
