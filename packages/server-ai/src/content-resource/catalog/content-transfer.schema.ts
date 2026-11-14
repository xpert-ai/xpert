import { BadRequestException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { t } from 'i18next'
import type { ContentTransferSnapshot } from '@xpert-ai/contracts'
import { parseAnalysisEvidence, analysisEvidenceDigestInput } from '@xpert-ai/plugin-sdk/analytics'
import { contentProjectionSchema } from './catalog.schema'

/** A reference cannot override the caller's actor, Project or Assistant scope. */
export const contentTransferReferenceSchema = z
    .object({
        contentId: z.string().min(1).max(256),
        expectedRevision: z.string().min(1).max(256)
    })
    .strict()

const source = z
    .object({
        providerKey: z.string().min(1).max(200),
        resourceId: z.string().min(1).max(256),
        revision: z.string().min(1).max(256),
        title: z.string().min(1).max(200)
    })
    .strict()
// Domain parsers below validate each body; the strict envelope prevents undeclared producer fields leaking across apps.
const envelope = z.discriminatedUnion('schema', [
    z.object({ schema: z.literal('xpert.content-transfer@1'), source, sections: z.unknown() }).strict(),
    z.object({ schema: z.literal('xpert.content-analysis-transfer@1'), source, evidence: z.unknown() }).strict()
])

/** Validate the entire producer envelope before handing it to another plugin.
 * Integrity is not authorization: the catalog separately checks live source access and revision. */
export function parseContentTransfer(value: unknown, projectId: string): ContentTransferSnapshot {
    try {
        const parsed = envelope.parse(value)
        let result: ContentTransferSnapshot
        if (parsed.schema === 'xpert.content-transfer@1') {
            const projection = contentProjectionSchema.parse({
                revision: parsed.source.revision,
                sections: parsed.sections
            })
            result = { ...parsed, sections: projection.sections } as ContentTransferSnapshot
        } else {
            const evidence = parseAnalysisEvidence(parsed.evidence)
            if (
                evidence.source.projectId !== projectId ||
                createHash('sha256').update(analysisEvidenceDigestInput(evidence)).digest('hex') !== evidence.sha256
            )
                throw new Error('Invalid evidence')
            result = { ...parsed, evidence } as ContentTransferSnapshot
        }
        if (Buffer.byteLength(JSON.stringify(result)) > 2_000_000) throw new Error('Transfer exceeds limit')
        return result
    } catch {
        // Do not return provider payloads or raw validation diagnostics to callers.
        throw new BadRequestException(t('server-ai:Error.ContentOperationInvalid'))
    }
}
