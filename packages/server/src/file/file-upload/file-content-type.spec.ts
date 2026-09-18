import { normalizeFileMimeType } from './file-content-type'

describe('file content type normalization', () => {
	it.each(['video/vnd.dlna.mpeg-tts', 'video/mp2t', 'application/octet-stream', undefined, ''])(
		'reads source bytes instead of trusting %s',
		(mimeType) => {
			const source = Buffer.from('export const value: string = "\u4f60\u597d"\n')
			expect(normalizeFileMimeType(source, mimeType)).toBe('text/plain')
		}
	)

	it.each([188, 192, 204])('preserves transport streams with %i byte packets', (packetSize) => {
		const data = Buffer.alloc(packetSize * 4, 0xff)
		for (let i = 0; i < 4; i++) {
			const start = i * packetSize + (packetSize === 192 ? 4 : 0)
			data.set([0x47, 0x40, 0x00, 0x10 | i], start)
		}
		expect(normalizeFileMimeType(data, 'video/vnd.dlna.mpeg-tts')).toBe('video/mp2t')
	})

	it.each([Buffer.from([0xff, 0xfe, 0x80]), Buffer.from('hello\0world')])(
		'does not send unrecognized binary data as video or text',
		(data) => {
			expect(normalizeFileMimeType(data, 'video/mp2t')).toBe('application/octet-stream')
		}
	)

	it('rejects a corrupt stream and truncated UTF-8, including at the end of a large file', () => {
		expect(normalizeFileMimeType(Buffer.alloc(188 * 3, 0xff), 'video/mp2t')).toBe('application/octet-stream')
		const truncated = Buffer.concat([Buffer.alloc(100000, 65), Buffer.from([0xe4, 0xb8])])
		expect(normalizeFileMimeType(truncated, 'video/mp2t')).toBe('application/octet-stream')
	})

	it('preserves declared types outside this ambiguous media correction', () => {
		expect(normalizeFileMimeType(Buffer.from('svg'), 'image/svg+xml')).toBe('image/svg+xml')
		expect(normalizeFileMimeType(Buffer.from('{}'), 'application/json')).toBe('application/json')
	})
})
