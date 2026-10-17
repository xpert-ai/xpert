import { createHash } from 'node:crypto'
import { sha256Hex } from './sha256'

const encode = (text: string) => new TextEncoder().encode(text)
const nativeDigest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

describe('Artifact dependency SHA-256', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    ]
  ])('matches the known digest for %j', (text, expected) => {
    expect(sha256Hex(encode(text))).toBe(expected)
  })

  it('matches the million-a standard vector', () => {
    expect(sha256Hex(encode('a'.repeat(1_000_000)))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0'
    )
  })

  it('matches Node crypto across padding boundaries and byte-offset views without mutating input', () => {
    const buffer = Uint8Array.from({ length: 280 }, (_, i) => (i * 73 + 151) & 255)
    const original = buffer.slice()
    for (let length = 0; length <= 256; length++) {
      const bytes = buffer.subarray(7, 7 + length)
      expect(sha256Hex(bytes)).toBe(nativeDigest(bytes))
    }
    expect(buffer).toEqual(original)
  })

  it('matches UTF-8 library source, including script tags, emoji and unpaired surrogates', () => {
    const bytes = encode('window.Chart={text:"中文📊\\u0000</script>\ud800\udc00\ud800"};')
    expect(sha256Hex(bytes)).toBe(nativeDigest(bytes))
    expect(sha256Hex(encode('abc'))).toBe(nativeDigest(encode('abc')))
  })

  it('matches Node crypto for a maximum-size dependency', () => {
    const bytes = Uint8Array.from({ length: 4_000_000 }, (_, i) => (i * 53 + (i >>> 8)) & 255)
    expect(sha256Hex(bytes)).toBe(nativeDigest(bytes))
  })
})
