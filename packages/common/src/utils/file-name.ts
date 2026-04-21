import path from 'path'

export function decodeMultipartFileName(fileName?: string) {
	const value = `${fileName ?? ''}`
	if (!value) {
		return ''
	}

	try {
		const decoded = Buffer.from(value, 'latin1').toString('utf8')
		if (!decoded.includes('\uFFFD') && Buffer.from(decoded, 'utf8').toString('latin1') === value) {
			return decoded
		}
	} catch {
		// Fall back to the original file name when it is already decoded or invalid.
	}

	return value
}

export function normalizeUploadedFileName(fileName?: string) {
	const normalized = path.basename(decodeMultipartFileName(fileName)).trim()
	if (!normalized) {
		throw new Error('Invalid file name')
	}
	return normalized
}
