import { TXpertTeamDraft } from '@xpert-ai/contracts'
import { HttpException, HttpStatus } from '@nestjs/common'

export const EventNameXpertValidate = 'xpert.validate'
export const EventName_XpertPublished = 'xpert.published'

export class XpertDraftValidateEvent {
    constructor(
        public readonly draft: TXpertTeamDraft,
        public readonly context?: {
            tenantId: string
            organizationId?: string | null
            xpertId: string
            creatorId?: string | null
        }
    ) {}
}

export class XpertNameInvalidException extends HttpException {
    constructor(message: string) {
        super(message, HttpStatus.BAD_REQUEST)
    }
}
