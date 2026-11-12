import { Command } from '@nestjs/cqrs'
import type { IXpert, TemplateDependencyLock, TXpertTemplate } from '@xpert-ai/contracts'
import type { PreparedTemplateExecution } from '../template-installation/template-execution.types'

export class PrepareTemplateExecutionCommand extends Command<PreparedTemplateExecution> {
    constructor(
        readonly template: TXpertTemplate,
        readonly owner: IXpert,
        readonly locks?: TemplateDependencyLock[],
        readonly projectId?: string
    ) {
        super()
    }
}
