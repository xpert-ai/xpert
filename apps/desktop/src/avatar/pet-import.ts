// Packages are read in memory, never extracted. Bound both declared and actual output sizes.
import type { PetSpriteVersion } from './pet-sprite'

export const PET_FILE_LIMIT = 8 * 1024 * 1024
const invalidZip = () => new Error('Choose a valid, unencrypted ZIP containing one pet.')
const decoder = new TextDecoder('utf-8', { fatal: true })
type ZipEntry = { name: string; method: number; crc: number; size: number; compressed: number; offset: number }
type PetManifest = { spritesheetPath: string; spriteVersionNumber?: PetSpriteVersion; displayName?: string }

function safePath(path: string): boolean {
  return (
    !!path &&
    !/[\\\x00-\x1f:]/.test(path) &&
    !path.startsWith('/') &&
    path
      .replace(/\/$/, '')
      .split('/')
      .every((part) => !!part && part !== '.' && part !== '..')
  )
}

function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let end = bytes.length - 22
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break
  }
  if (end < 0 || end < bytes.length - 65557 || view.getUint32(end, true) !== 0x06054b50) throw invalidZip()
  const count = view.getUint16(end + 10, true)
  const directorySize = view.getUint32(end + 12, true)
  let cursor = view.getUint32(end + 16, true)
  if (
    view.getUint16(end + 4, true) ||
    view.getUint16(end + 6, true) ||
    count !== view.getUint16(end + 8, true) ||
    count < 1 ||
    count > 128 ||
    cursor + directorySize !== end
  )
    throw invalidZip()
  const entries: ZipEntry[] = []
  const names = new Set<string>()
  let total = 0
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) throw invalidZip()
    const flags = view.getUint16(cursor + 8, true)
    const method = view.getUint16(cursor + 10, true)
    const compressed = view.getUint32(cursor + 20, true)
    const size = view.getUint32(cursor + 24, true)
    const nameSize = view.getUint16(cursor + 28, true)
    const next = cursor + 46 + nameSize + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true)
    if (next > end || flags & 1 || ![0, 8].includes(method) || view.getUint16(cursor + 34, true)) throw invalidZip()
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize))
    const offset = view.getUint32(cursor + 42, true)
    total += size
    if (
      !safePath(name) ||
      names.has(name) ||
      size > PET_FILE_LIMIT ||
      compressed > PET_FILE_LIMIT ||
      total > PET_FILE_LIMIT * 4 ||
      offset + 30 + compressed > end
    )
      throw invalidZip()
    names.add(name)
    entries.push({ name, method, size, compressed, offset, crc: view.getUint32(cursor + 16, true) })
    cursor = next
  }
  if (cursor !== end) throw invalidZip()
  return entries.filter(
    ({ name }) =>
      !name.endsWith('/') && !name.startsWith('__MACOSX/') && !name.endsWith('/.DS_Store') && name !== '.DS_Store'
  )
}

const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

async function unpack(bytes: Uint8Array, entry: ZipEntry, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (entry.size > limit) throw invalidZip()
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const offset = entry.offset
  if (
    view.getUint32(offset, true) !== 0x04034b50 ||
    view.getUint16(offset + 6, true) & 1 ||
    view.getUint16(offset + 8, true) !== entry.method
  )
    throw invalidZip()
  const nameSize = view.getUint16(offset + 26, true)
  if (decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameSize)) !== entry.name) throw invalidZip()
  const start = offset + 30 + nameSize + view.getUint16(offset + 28, true)
  if (start + entry.compressed > bytes.length) throw invalidZip()
  const compressed = bytes.slice(start, start + entry.compressed)
  let output = compressed
  if (entry.method === 8) {
    const reader = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
    output = new Uint8Array(entry.size)
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > entry.size || size > limit) throw invalidZip()
        output.set(value, size - value.byteLength)
      }
      if (size !== entry.size) throw invalidZip()
    } catch {
      throw invalidZip()
    } finally {
      await reader.cancel().catch(() => {})
    }
  }
  if (output.length !== entry.size || crc32(output) !== entry.crc) throw invalidZip()
  return output
}

function parseManifest(value: unknown): PetManifest {
  if (
    !value ||
    typeof value !== 'object' ||
    !('spritesheetPath' in value) ||
    typeof value.spritesheetPath !== 'string' ||
    !safePath(value.spritesheetPath) ||
    value.spritesheetPath.endsWith('/')
  )
    throw new Error('pet.json must specify a relative spritesheetPath.')
  const version = 'spriteVersionNumber' in value ? value.spriteVersionNumber : undefined
  if (version !== undefined && version !== 1 && version !== 2)
    throw new Error('This pet sprite version is not supported. Use v1 or v2.')
  const name = 'displayName' in value ? value.displayName : undefined
  if (name !== undefined && (typeof name !== 'string' || name.length > 100)) throw invalidZip()
  return { spritesheetPath: value.spritesheetPath, spriteVersionNumber: version, displayName: name }
}

function imageMime(bytes: Uint8Array): string | undefined {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end))
  if (bytes.length >= 16 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (bytes.length >= 8 && bytes.subarray(0, 8).every((byte, i) => byte === [137, 80, 78, 71, 13, 10, 26, 10][i]))
    return 'image/png'
  if (['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif'
}

export async function readPetImport(file: Blob): Promise<{
  image: Blob
  packaged: boolean
  spriteVersionNumber?: PetSpriteVersion
  displayName?: string
}> {
  if (file.size > PET_FILE_LIMIT) throw new Error('Choose a pet image or ZIP smaller than 8 MB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = imageMime(bytes)
  if (mime) return { image: new Blob([bytes], { type: mime }), packaged: false }
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error('Choose a PNG, WebP, GIF or pet ZIP file.')
  let entries: ZipEntry[]
  try {
    entries = zipEntries(bytes)
  } catch {
    throw invalidZip()
  }
  const manifests = entries.filter(({ name }) => name.split('/').at(-1) === 'pet.json')
  if (manifests.length > 1) throw new Error('Import one pet per ZIP file.')
  let manifest: PetManifest | undefined
  let imageEntry: ZipEntry | undefined
  if (manifests.length) {
    const json = await unpack(bytes, manifests[0], 64 * 1024)
    let value: unknown
    try {
      value = JSON.parse(decoder.decode(json))
    } catch {
      throw new Error('pet.json is not valid JSON.')
    }
    manifest = parseManifest(value)
    const folder = manifests[0].name.slice(0, -'pet.json'.length)
    const imagePath = folder + manifest.spritesheetPath
    imageEntry = entries.find(({ name }) => name === imagePath)
    if (!imageEntry) throw new Error('The sprite sheet referenced by pet.json is missing from the ZIP.')
  } else {
    const images = entries.filter(({ name }) => /\.(png|webp)$/i.test(name))
    if (images.length !== 1) throw new Error('Include pet.json or exactly one PNG / WebP sprite sheet in the ZIP.')
    imageEntry = images[0]
  }
  const image = await unpack(bytes, imageEntry, PET_FILE_LIMIT)
  const imageType = imageMime(image)
  if (imageType !== 'image/png' && imageType !== 'image/webp')
    throw new Error('A pet package must contain a PNG or WebP sprite sheet.')
  return {
    image: new Blob([image], { type: imageType }),
    packaged: true,
    spriteVersionNumber: manifest?.spriteVersionNumber,
    displayName: manifest?.displayName
  }
}
