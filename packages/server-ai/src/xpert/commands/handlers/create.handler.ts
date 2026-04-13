import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { FindCopilotModelsQuery } from '../../../copilot/queries'
import { syncPrimaryAgentModelWithTeamSelection } from '../../copilot-model-sync.util'
import { Xpert } from '../../xpert.entity'
import { XpertService } from '../../xpert.service'
import { XpertCreateCommand } from '../create.command'

@CommandHandler(XpertCreateCommand)
export class XpertCreateHandler implements ICommandHandler<XpertCreateCommand> {
    readonly #logger = new Logger(XpertCreateHandler.name)

    constructor(
        private readonly roleService: XpertService,
        private readonly queryBus: QueryBus
    ) {}

    public async execute(command: XpertCreateCommand): Promise<Xpert> {
        const entity = command.input
        const result = await this.roleService.findOneOrFailByWhereOptions({ name: entity.name })
        if (result.success) {
            throw new Error(`Xpert with name ${entity.name} already exists`)
        }

        const availableLlmCopilots = await this.queryBus.execute(new FindCopilotModelsQuery(AiModelTypeEnum.LLM))
        syncPrimaryAgentModelWithTeamSelection(entity, availableLlmCopilots)

        return await this.roleService.create(entity)
    }
}
