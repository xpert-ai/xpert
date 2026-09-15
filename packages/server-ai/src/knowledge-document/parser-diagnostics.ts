import { DocumentInterface } from '@langchain/core/documents'
import { DocumentParserDiagnostics } from '@xpert-ai/contracts'
import { z } from 'zod'

const diagnosticsSchema = z.object({
    schemaVersion: z.literal(1),
    pages: z.array(
        z.object({
            page: z.number().int().positive(),
            status: z.enum(['text', 'blank', 'needs-ocr', 'recognized']),
            imagePaths: z.array(z.string())
        })
    )
})

export function textWithoutImages(text: string): string {
    return text.replace(/!\[[^\]]*\]\s*\([^\n]*?\)/g, '').trim()
}

/** Conversion evidence remains authoritative; only nonempty OCR of every page asset closes a gap. */
export function resolveParserDiagnostics(
    inputs: unknown[],
    chunks: DocumentInterface[]
): DocumentParserDiagnostics | undefined {
    const pages = inputs.flatMap((value) => {
        const result = diagnosticsSchema.safeParse(value)
        return result.success ? result.data.pages : []
    })
    if (!pages.length) return undefined
    const unreadablePaths = new Set(
        chunks.filter((chunk) => chunk.pageContent.includes('[unreadable]')).map((chunk) => chunk.metadata.imagePath)
    )
    const recognizedPaths = new Set(
        chunks
            .filter(
                (chunk) =>
                    chunk.metadata.parser === 'vlm' &&
                    textWithoutImages(chunk.pageContent) &&
                    !unreadablePaths.has(chunk.metadata.imagePath)
            )
            .map((chunk) => chunk.metadata.imagePath)
    )
    return {
        schemaVersion: 1,
        pages: pages.map((page) => ({
            page: page.page,
            imagePaths: page.imagePaths,
            status: page.imagePaths.length
                ? page.imagePaths.every((path) => recognizedPaths.has(path))
                    ? 'recognized'
                    : 'needs-ocr'
                : page.status
        }))
    }
}
