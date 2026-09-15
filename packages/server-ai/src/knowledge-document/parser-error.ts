import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'

const messages = {
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
} as const

/** Translate bounded plugin error codes once at the API boundary, retaining unknown errors intact. */
export function rethrowParserError(error: unknown): never {
    if (error instanceof Error && Object.prototype.hasOwnProperty.call(messages, error.message)) {
        const [key, defaultValue] = messages[error.message as keyof typeof messages]
        throw new BadRequestException(t(`server-ai:Error.${key}`, { defaultValue }))
    }
    throw error
}
