import { TextDecoder } from 'node:util'

// A .ts upload can be source code or an MPEG transport stream. Client MIME
// labels are not evidence of either. Never execute code to classify a file.
function needsFileContentTypeCheck(mimeType?: string): boolean {
	const type = mimeType?.split(';', 1)[0].trim().toLowerCase()
	return !type || ['video/mp2t', 'video/vnd.dlna.mpeg-tts', 'application/octet-stream'].includes(type)
}

function isUtf8Text(data: Uint8Array): boolean {
	try {
		const text = new TextDecoder('utf-8', { fatal: true }).decode(data)
		// Allow tab, line breaks and form feed, but not binary control bytes.
		return !/[\u0000-\u0008\u000b\u000e-\u001f\u007f-\u009f]/.test(text)
	} catch {
		return false
	}
}

export function normalizeFileMimeType(data: Uint8Array, declaredMimeType?: string): string {
	if (!needsFileContentTypeCheck(declaredMimeType)) {
		return declaredMimeType
	}
	if (isUtf8Text(data)) {
		return 'text/plain'
	}
	if (isTransportStream(data)) {
		return 'video/mp2t'
	}
	return 'application/octet-stream'
}

function isTransportStream(data: Uint8Array): boolean {
	// TS, timestamp-prefixed M2TS, and error-corrected TS packet layouts.
	return [188, 192, 204].some((packetSize) => {
		const packetCount = Math.min(16, Math.floor(data.length / packetSize))
		if (packetCount < 3) {
			return false
		}
		for (let packet = 0; packet < packetCount; packet++) {
			const offset = packet * packetSize + (packetSize === 192 ? 4 : 0)
			const adaptationControl = (data[offset + 3] >> 4) & 3
			if (data[offset] !== 0x47 || adaptationControl === 0) {
				return false
			}
			if (adaptationControl & 2 && data[offset + 4] > 183) {
				return false
			}
		}
		return true
	})
}
