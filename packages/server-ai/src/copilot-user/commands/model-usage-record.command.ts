import type { ICopilot, IModelAccessResolution, ModelUsagePricingSnapshot, ModelUsageReport } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class CopilotModelUsageRecordCommand implements ICommand {
    static readonly type = '[Copilot] Record Model Usage'

    constructor(
        public readonly input: {
            tenantId: string
            organizationId?: string | null
            userId: string
            xpertId?: string | null
            originId?: string | null
            originExecutionId?: string | null
            copilotId?: string
            copilot?: ICopilot
            modelAccess?: IModelAccessResolution
            report: ModelUsageReport
            pricingSnapshot: ModelUsagePricingSnapshot
        }
    ) {}
}
