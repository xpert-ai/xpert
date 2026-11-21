import { BadRequestException } from '@nestjs/common'
import { t } from 'i18next'
import { IsNull } from 'typeorm'
import type { KnowledgebaseListDocumentsInput } from '@xpert-ai/plugin-sdk'

/** Exact filters stay inside the authorized Knowledge query and its source-hash index. */
export function documentFingerprintFilter(input: KnowledgebaseListDocumentsInput) {
    const hasHash = input.sourceHash !== undefined
    if (
        (hasHash && input.sourceHash !== null && !/^[a-f0-9]{64}$/i.test(input.sourceHash)) ||
        (input.size !== undefined && (!Number.isSafeInteger(input.size) || input.size < 0))
    ) {
        throw new BadRequestException(
            t('server-ai:Error.InvalidDocumentFingerprintFilter', {
                defaultValue: 'Use a SHA-256 source fingerprint and a non-negative integer byte size.'
            })
        )
    }
    const sourceHash = typeof input.sourceHash === 'string' ? input.sourceHash.toLowerCase() : input.sourceHash
    return {
        where: {
            ...(hasHash ? { sourceHash: sourceHash === null ? IsNull() : sourceHash } : {}),
            ...(input.size !== undefined ? { size: input.size } : {})
        },
        appliedFilters:
            hasHash || input.size !== undefined
                ? { ...(hasHash ? { sourceHash } : {}), ...(input.size !== undefined ? { size: input.size } : {}) }
                : undefined
    }
}
