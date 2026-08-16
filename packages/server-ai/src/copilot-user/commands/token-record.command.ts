import { AiModelTypeEnum, ICopilot, IModelAccessResolution } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class CopilotTokenRecordCommand implements ICommand {
    static readonly type = '[Copilot] Record Token'

    constructor(
        public readonly input: {
            tenantId: string
            requestId: string
            organizationId?: string
            userId: string
            xpertId?: string
            threadId?: string
            copilotId?: string
            copilot?: ICopilot
            model?: string
            modelType?: AiModelTypeEnum
            modelAccess?: IModelAccessResolution
            promptTokens?: number
            completionTokens?: number
            tokenUsed?: number
            priceUsed?: number
            currency?: string
        }
    ) {}
}
