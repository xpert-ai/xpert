const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const { deflateRawSync, crc32 } = require('node:zlib')
const ts = require('typescript')

function load(name) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(join(__dirname, '../src/avatar', name), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  runInNewContext(code, { exports, Uint8Array, Uint32Array, Blob, TextDecoder, DecompressionStream })
  return exports
}
const { readPetImport, PET_FILE_LIMIT } = load('pet-import.ts')
const { petSpriteVersion, validatePetSprite, petLookFrame } = load('pet-sprite.ts')
const { createAssistantAppearanceMethods } = require('../electron/assistant-appearance.cjs')
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==',
  'base64'
)

// Independent ZIP writer: stored/deflated entries, optional trailing data descriptors, UTF-8 names.
function archive(files, { stored = false, descriptor = false, mutate } = {}) {
  const local = [],
    central = []
  let offset = 0
  for (const [name, data] of files) {
    const raw = Buffer.isBuffer(data) ? data : Buffer.from(data)
    const content = stored ? raw : deflateRawSync(raw)
    const filename = Buffer.from(name)
    const header = Buffer.alloc(30),
      directory = Buffer.alloc(46)
    const flags = 0x800 | (descriptor ? 8 : 0)
    const method = stored ? 0 : 8
    header.writeUInt32LE(0x04034b50)
    header.writeUInt16LE(flags, 6)
    header.writeUInt16LE(method, 8)
    header.writeUInt16LE(filename.length, 26)
    directory.writeUInt32LE(0x02014b50)
    directory.writeUInt16LE(flags, 8)
    directory.writeUInt16LE(method, 10)
    directory.writeUInt32LE(crc32(raw), 16)
    directory.writeUInt32LE(content.length, 20)
    directory.writeUInt32LE(raw.length, 24)
    directory.writeUInt16LE(filename.length, 28)
    directory.writeUInt32LE(offset, 42)
    if (!descriptor) directory.copy(header, 14, 16, 28)
    const trailing = descriptor ? Buffer.alloc(16) : Buffer.alloc(0)
    if (descriptor) {
      trailing.writeUInt32LE(0x08074b50)
      directory.copy(trailing, 4, 16, 28)
    }
    mutate?.(directory, header)
    local.push(header, filename, content, trailing)
    central.push(directory, filename)
    offset += header.length + filename.length + content.length + trailing.length
  }
  const directory = Buffer.concat(central),
    end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Blob([...local, directory, end])
}

test('detects standard v1/v2 dimensions and checks declared versions', () => {
  assert.equal(petSpriteVersion(1536, 1872), 1)
  assert.equal(petSpriteVersion(1536, 2288), 2)
  for (const [width, height] of [
    [1280, 1907],
    [1536, 2080],
    [768, 1144]
  ]) {
    assert.equal(petSpriteVersion(width, height), undefined)
    assert.throws(() => validatePetSprite(width, height))
  }
  assert.equal(validatePetSprite(1536, 2288, 2), 2)
  assert.equal(validatePetSprite(1536, 1872), 1)
  assert.throws(() => validatePetSprite(1536, 2288, 1), /do not match/)
})

test('the preset catalog preserves sprite versions for open resource IDs and rejects unknown versions', async () => {
  let catalog = [
    { id: 'legacy-pet', label: 'Legacy' },
    { id: 'new-pet_2040', label: 'New pet', spriteVersionNumber: 2 }
  ]
  const host = {
    ...createAssistantAppearanceMethods(Error),
    profile: { organizationId: 'org' },
    bots: [{ id: 'assistant' }],
    config: { frameUrl: 'https://frame.example/' },
    fetcher: async () => new Response(JSON.stringify(catalog))
  }
  assert.deepEqual(await host.assistantPetCatalog({ botId: 'assistant' }), catalog)
  catalog = [{ id: 'future-pet', label: 'Future', spriteVersionNumber: 3 }]
  await assert.rejects(host.assistantPetCatalog({ botId: 'assistant' }), /pet catalog/)
})

test('v2 maps all sixteen directions clockwise from up, with an idle dead zone', () => {
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8
    const pose = petLookFrame(Math.sin(angle) * 100, -Math.cos(angle) * 100)
    assert.equal(pose.row, 9 + Math.floor(i / 8))
    assert.equal(pose.column, i % 8)
  }
  for (const point of [
    [0, 0],
    [3, 4],
    [NaN, 0],
    [0, Infinity]
  ])
    assert.equal(petLookFrame(...point), null)
})

test('standalone images are detected by content rather than MIME or filename', async () => {
  const result = await readPetImport(new Blob([png], { type: 'application/octet-stream' }))
  assert.equal(result.packaged, false)
  assert.equal(result.image.type, 'image/png')
  assert.deepEqual(Buffer.from(await result.image.arrayBuffer()), png)
  const webp = Buffer.from('RIFF0000WEBPVP8 0000')
  assert.equal((await readPetImport(new Blob([webp]))).image.type, 'image/webp')
  assert.equal((await readPetImport(new Blob(['GIF89a123456789']))).image.type, 'image/gif')
  await assert.rejects(readPetImport(new Blob(['<svg>invalid</svg>'], { type: 'image/webp' })), /Choose a PNG/)
})

test('imports root/nested Codex pet packages, both stored and deflated, with data descriptors', async () => {
  for (const folder of ['', 'quill-field-notes.codex-pet/', '宠物/']) {
    for (const options of [{}, { stored: true }, { descriptor: true }]) {
      const manifest = {
        id: 'future-pet',
        displayName: 'Quill',
        spritesheetPath: 'images/pet.png',
        spriteVersionNumber: 2,
        kind: 'animal'
      }
      const result = await readPetImport(
        archive(
          [
            [folder + 'pet.json', JSON.stringify(manifest)],
            [folder + 'images/pet.png', png],
            ['__MACOSX/._pet.json', 'finder metadata']
          ],
          options
        )
      )
      assert.equal(result.packaged, true)
      assert.equal(result.spriteVersionNumber, 2)
      assert.equal(result.displayName, 'Quill')
      assert.deepEqual(Buffer.from(await result.image.arrayBuffer()), png)
    }
  }
})

test('accepts a single sprite without a manifest and older manifests without a version', async () => {
  const alone = await readPetImport(archive([['custom.png', png]]))
  assert.equal(alone.spriteVersionNumber, undefined)
  const legacy = await readPetImport(
    archive([
      ['pet.json', JSON.stringify({ spritesheetPath: 'pet.png' })],
      ['pet.png', png]
    ])
  )
  assert.equal(legacy.spriteVersionNumber, undefined)
  assert.equal(legacy.packaged, true)
})

test('rejects ambiguous, unsupported, missing and malformed pet manifests', async () => {
  for (const files of [
    [
      ['a.png', png],
      ['b.png', png]
    ],
    [
      ['a/pet.json', '{}'],
      ['b/pet.json', '{}']
    ],
    [['pet.json', '{broken']],
    [['pet.json', JSON.stringify({ spritesheetPath: 'missing.webp' })]],
    [
      ['pet.json', JSON.stringify({ spritesheetPath: '../pet.png' })],
      ['pet.png', png]
    ],
    [['pet.json', JSON.stringify({ spritesheetPath: 'https://outside/pet.webp' })]],
    [
      ['pet.json', JSON.stringify({ spritesheetPath: 'pet.png', spriteVersionNumber: 3 })],
      ['pet.png', png]
    ],
    [
      ['pet.json', JSON.stringify({ spritesheetPath: 'pet.png', spriteVersionNumber: '2' })],
      ['pet.png', png]
    ],
    [
      ['pet.json', JSON.stringify({ spritesheetPath: 'pet.png' })],
      ['pet.png', 'GIF89a123456789']
    ],
    [['pet.json', '{}']]
  ])
    await assert.rejects(readPetImport(archive(files)))
})

test('rejects unsafe paths, duplicate entries, encrypted, corrupted and oversized ZIPs', async () => {
  for (const path of ['../pet.png', '/pet.png', 'C:/pet.png', 'a\\pet.png', 'a/./pet.png'])
    await assert.rejects(readPetImport(archive([[path, png]])))
  await assert.rejects(
    readPetImport(
      archive([
        ['pet.png', png],
        ['pet.png', png]
      ])
    )
  )
  for (const mutate of [
    (entry) => entry.writeUInt16LE(1, 8),
    (entry) => entry.writeUInt32LE(0, 16),
    (entry) => entry.writeUInt32LE(PET_FILE_LIMIT + 1, 24),
    (entry) => entry.writeUInt32LE(1, 24), // Actual inflate output exceeds the declared size.
    (entry) => entry.writeUInt32LE(0xffffffff, 42),
    (entry) => entry.writeUInt16LE(99, 10)
  ])
    await assert.rejects(readPetImport(archive([['pet.png', png]], { mutate })))
  const zip = archive([['pet.png', png]])
  await assert.rejects(readPetImport(zip.slice(0, zip.size - 3)))
  await assert.rejects(readPetImport(new Blob([new Uint8Array(PET_FILE_LIMIT + 1)])), /8 MB/)
})
