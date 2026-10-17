import { ConflictException } from '@nestjs/common'
import { t } from 'i18next'
import type { EnsureArtifactVersionInput } from '@xpert-ai/plugin-sdk'

/** Called inside the Artifact row lock. A retry may reuse the current immutable version. */
export function assertArtifactVersionPrecondition(
    input: EnsureArtifactVersionInput,
    currentId: string | null | undefined,
    existingId?: string
) {
    if (input.setCurrent === false || input.expectedCurrentVersionId === undefined) return
    if ((currentId ?? null) === input.expectedCurrentVersionId || (existingId && existingId === currentId)) return
    throw new ConflictException({
        code: 'ARTIFACT_VERSION_CONFLICT',
        message: t('server-ai:Error.ArtifactVersionConflict', {
            defaultValue: 'Artifact was changed by another save. Reopen it before saving again.'
        })
    })
}
