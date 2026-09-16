import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

const messages: Record<string, readonly [string, string]> = {
    OPENDATALOADER_OCR_FAILED: [
        'KnowledgeParserOcrFailed',
        'OCR did not produce readable text for all scanned pages. Retry or check the scan quality and managed OCR Runtime.'
    ],
    MARKITDOWN_EMPTY_FILE: [
        'KnowledgeParserEmptyFile',
        'The uploaded file is empty. Upload a file containing content.'
    ],
    MARKITDOWN_EMPTY_TEXT: [
        'KnowledgeParserEmptyText',
        'No readable text was found. Check whether the file contains only whitespace or blank pages.'
    ],
    MARKITDOWN_INVALID_DOCUMENT: [
        'KnowledgeParserInvalidDocument',
        'The file is damaged, encrypted, or does not match its extension. Open it locally and export it again.'
    ],
    MARKITDOWN_INPUT_TOO_LARGE: [
        'KnowledgeParserInputTooLarge',
        'The file exceeds the 100 MB conversion limit. Split it before uploading.'
    ],
    MARKITDOWN_OUTPUT_TOO_LARGE: [
        'KnowledgeParserOutputTooLarge',
        'The converted content exceeds the output limit. Split the document and retry.'
    ]
}

const documentParserMessages: Record<string, readonly [string, string]> = {
    EMPTY_FILE: messages.MARKITDOWN_EMPTY_FILE,
    EMPTY_TEXT: messages.MARKITDOWN_EMPTY_TEXT,
    INPUT_TOO_LARGE: messages.MARKITDOWN_INPUT_TOO_LARGE,
    OUTPUT_TOO_LARGE: messages.MARKITDOWN_OUTPUT_TOO_LARGE,
    INVALID_DOCUMENT: messages.MARKITDOWN_INVALID_DOCUMENT,
    ENCRYPTED: [
        'KnowledgeParserEncrypted',
        'The document is encrypted. Export an unencrypted copy and upload it again.'
    ],
    UNSUPPORTED_FORMAT: [
        'KnowledgeParserUnsupportedFormat',
        'This parser does not support the document format. Select a compatible parser.'
    ],
    UNSUPPORTED_ENCODING: [
        'KnowledgeParserUnsupportedEncoding',
        'This parser requires UTF-8 CSV files. Save the file as CSV UTF-8 and upload it again, or select the builtin parser.'
    ],
    NEEDS_OCR: [
        'KnowledgeParserNeedsOcr',
        'This PDF contains pages that require OCR. Select MinerU, Baidu OCR, or PDFium/MarkItDown with image understanding enabled.'
    ],
    INCOMPLETE_PAGES: [
        'KnowledgeParserIncompletePages',
        'The parser could not verify all PDF pages. Select a parser that supports scanned pages and retry.'
    ],
    RESOURCE_LIMIT: [
        'KnowledgeParserResourceLimit',
        'Document conversion reached its resource or time limit. Split the document and retry.'
    ],
    RUNTIME_INVALID: [
        'KnowledgeParserRuntimeInvalid',
        'The managed document Runtime is missing or invalid. Ask the administrator to install and verify it.'
    ]
}
for (const prefix of ['ANYDOC', 'OPENDATALOADER']) {
    for (const [code, message] of Object.entries(documentParserMessages)) messages[`${prefix}_${code}`] = message
}

/** Translate bounded plugin error codes once at the API boundary, retaining unknown errors intact. */
export function rethrowParserError(error: unknown): never {
    if (error instanceof Error && Object.prototype.hasOwnProperty.call(messages, error.message)) {
        const [key, defaultValue] = messages[error.message as keyof typeof messages]
        let message = t(`server-ai:Error.${key}`, { defaultValue })
        const pages = (error as Error & { pages?: unknown }).pages
        if (
            /^(ANYDOC|OPENDATALOADER)_(NEEDS_OCR|INCOMPLETE_PAGES|OCR_FAILED)$/.test(error.message) &&
            Array.isArray(pages) &&
            pages.length > 0 &&
            pages.length <= 100 &&
            pages.every((page) => Number.isSafeInteger(page) && page > 0 && page <= 10000)
        ) {
            const pageList = [...new Set(pages)].sort((a, b) => a - b).join(', ')
            message +=
                ' ' +
                t('server-ai:Error.KnowledgeParserAffectedPages', {
                    defaultValue: `Affected pages (up to 100): ${pageList}.`,
                    pages: pageList
                })
        }
        throw new BadRequestException(message)
    }
    throw error
}
