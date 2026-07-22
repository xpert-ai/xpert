import { IXpertAgentExecution, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { XpertAgentExecutionService } from '../../agent-execution.service'
import { XpertAgentExecutionUpsertCommand } from '../upsert.command'

@CommandHandler(XpertAgentExecutionUpsertCommand)
export class XpertAgentExecutionUpsertHandler implements ICommandHandler<XpertAgentExecutionUpsertCommand> {
    readonly #logger = new Logger(XpertAgentExecutionUpsertHandler.name)

    constructor(
        private readonly executionService: XpertAgentExecutionService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus
    ) {}

    public async execute(command: XpertAgentExecutionUpsertCommand): Promise<IXpertAgentExecution> {
        const entity = command.execution
        if (entity.id) {
            const existing = await this.executionService.findOneOrFailByIdString(entity.id)
            if (existing.success) {
                const update =
                    existing.record.status === XpertAgentExecutionStatusEnum.INTERRUPTED &&
                    entity.status !== XpertAgentExecutionStatusEnum.RUNNING
                        ? {
                              ...entity,
                              status: XpertAgentExecutionStatusEnum.INTERRUPTED,
                              error: existing.record.error ?? entity.error
                          }
                        : entity
                await this.executionService.update(entity.id, update)
                return await this.executionService.findOne(entity.id)
            }
        }
        return await this.executionService.create(entity)
    }
}
