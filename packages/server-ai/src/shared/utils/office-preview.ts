import { parseOfficeAsync } from 'officeparser'

const OFFICE_TEXT_PREVIEW_EXTENSIONS = new Set(['docx', 'pptx'])

export async function extractOfficePreviewText(filePath: string, buffer: Buffer): Promise<string | undefined> {
	const extension = filePath.split('.').pop()?.toLowerCase()
	if (!extension || !OFFICE_TEXT_PREVIEW_EXTENSIONS.has(extension)) {
		return undefined
	}

	try {
		const result = await parseOfficeAsync(buffer, {
			ignoreNotes: true,
			newlineDelimiter: '\n',
			outputErrorToConsole: false
		})
		return normalizeOfficePreviewText(result)
	} catch {
		return undefined
	}
}

function normalizeOfficePreviewText(value?: string | null) {
	if (typeof value !== 'string') {
		return undefined
	}

	const normalized = value.replace(/\0/g, '').replace(/\r\n/g, '\n').trim()
	return normalized || undefined
}
