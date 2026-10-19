import { Command } from '@nestjs/cqrs'

export type PipelineModelBudgetActor = { tenantId: string; organizationId?: string; userId: string }
export type PipelineModelBudgetCall = { actor: PipelineModelBudgetActor; executionId: string; requestId: string }
/** Host model entry only: resolve persisted native execution ancestry before admitting a request. */
export class AdmitPipelineModelCallCommand extends Command<boolean> {
    constructor(readonly input: PipelineModelBudgetCall) {
        super()
    }
}
/** Consume the same normalized provider usage as native billing; estimates never settle a reservation. */
export class SettlePipelineModelCallCommand extends Command<void> {
    constructor(readonly input: PipelineModelBudgetCall & { actualTokens: number }) {
        super()
    }
}
