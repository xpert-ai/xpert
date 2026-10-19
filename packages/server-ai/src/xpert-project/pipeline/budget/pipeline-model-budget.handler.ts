import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { AdmitPipelineModelCallCommand, SettlePipelineModelCallCommand } from './pipeline-model-budget.command'
import { ProjectPipelineModelBudgetStore } from './pipeline-model-budget.store'

@CommandHandler(AdmitPipelineModelCallCommand)
export class AdmitPipelineModelCallHandler implements ICommandHandler<AdmitPipelineModelCallCommand> {
    constructor(private readonly budgets: ProjectPipelineModelBudgetStore) {}
    execute(command: AdmitPipelineModelCallCommand) {
        return this.budgets.admit(command.input)
    }
}
@CommandHandler(SettlePipelineModelCallCommand)
export class SettlePipelineModelCallHandler implements ICommandHandler<SettlePipelineModelCallCommand> {
    constructor(private readonly budgets: ProjectPipelineModelBudgetStore) {}
    execute(command: SettlePipelineModelCallCommand) {
        return this.budgets.settle(command.input)
    }
}
