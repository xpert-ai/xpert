const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseAvatarUrl } = require('../electron/avatar-url.cjs')
const { inlineAvatar } = require('./fixtures/avatar.cjs')

test('avatar URLs support web images and embedded template images', () => {
  for (const source of [inlineAvatar, 'https://example.com/avatar.webp', 'http://localhost:3000/avatar.png'])
    assert.equal(parseAvatarUrl(` ${source} `), source)
  for (const type of ['png', 'jpeg', 'gif', 'webp', 'avif', 'svg+xml']) {
    const source = inlineAvatar.replace('image/webp', `image/${type}`)
    assert.equal(parseAvatarUrl(source), source)
  }
})

test('invalid avatar metadata falls back without allowing other URL schemes or malformed base64', () => {
  for (const source of [
    null,
    undefined,
    42,
    '',
    'https://',
    'https://user:secret@example.com/avatar.png',
    'javascript:alert(1)',
    'file:///private/avatar.png',
    'blob:https://example.com/avatar',
    '//example.com/avatar.png',
    'data:text/html;base64,PHNjcmlwdD4=',
    'data:application/octet-stream;base64,AAAA',
    'data:image/svg+xml,<svg/>',
    'data:image/webp;base64,',
    'data:image/webp;base64,AAAA!',
    'data:image/webp;base64,AA A',
    'data:image/webp;base64,AA_A',
    'data:image/webp;base64,AA',
    'data:image/webp;base64,=AAA',
    'data:image/webp;base64,AA==AAAA',
    'data:image/webp;base64,AAB='
  ])
    assert.equal(parseAvatarUrl(source), null)
})

test('inline avatars enforce the upload size limit on decoded bytes', () => {
  const limit = 5 * 1024 * 1024
  const atLimit = `data:image/webp;base64,${Buffer.alloc(limit).toString('base64')}`
  assert.equal(parseAvatarUrl(atLimit), atLimit)
  for (const size of [limit + 1, limit + 3])
    assert.equal(parseAvatarUrl(`data:image/webp;base64,${Buffer.alloc(size).toString('base64')}`), null)
})
