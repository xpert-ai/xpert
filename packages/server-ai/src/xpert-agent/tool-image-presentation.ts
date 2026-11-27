import type { ToolOutputImageAttachment } from '@xpert-ai/chatkit-types'
import type { PublicToolPresentation } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

const id = z.string().trim().min(1).max(256)
const label = z.string().trim().min(1).max(500)
const image = z
    .object({
        type: z.literal('image'),
        artifactId: id,
        artifactVersionId: id,
        sha256: z.string().regex(/^[a-f0-9]{64}$/i),
        mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
        width: z.number().int().positive().max(100_000).optional(),
        height: z.number().int().positive().max(100_000).optional(),
        title: label.optional(),
        alt: label.optional(),
        source: z.enum(['knowledge-document', 'sandbox', 'tool']),
        modelDetail: z.enum(['auto', 'low', 'high']),
        anchors: z
            .object({
                knowledgeDocumentId: id.optional(),
                page: z.number().int().positive().max(1_000_000).optional(),
                chunkId: id.optional(),
                sourceBlockIds: z.array(id).max(100).optional(),
                visualAssetId: id.optional()
            })
            .strict()
            .optional()
    })
    .strict()
const presentation = z
    .object({
        type: z.literal('xpert.tool-output'),
        version: z.literal(1),
        attachments: z.array(image).min(1).max(20)
    })
    .strict()

/** The tool must opt in. Private artifacts, paths, URLs and image bytes never become transcript data. */
export function presentToolImages(
    policy: PublicToolPresentation | undefined,
    artifact: unknown
): ToolOutputImageAttachment[] | undefined {
    if (policy?.attachments !== 'images') return
    const parsed = presentation.safeParse(artifact)
    if (!parsed.success) return
    // The strict schema validates all required fields; this project compiles with strictNullChecks disabled.
    const attachments = parsed.data.attachments as ToolOutputImageAttachment[]
    const unique = new Map(
        attachments.map((item) => [`${item.artifactId}:${item.artifactVersionId}:${item.sha256}`, item])
    )
    return [...unique.values()]
}
