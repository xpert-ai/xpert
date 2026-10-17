import { Query } from '@nestjs/cqrs'
import type { IXpert } from '@xpert-ai/contracts'

/** Resolves the exact Assistant authorized for transcription, keeping Studio drafts author-only. */
export class ResolveSpeechAssistantQuery extends Query<IXpert> {
    constructor(
        readonly xpertId: string,
        readonly options: { isDraft?: boolean; tenantId?: string | null; organizationId?: string | null } = {}
    ) {
        super()
    }
}
