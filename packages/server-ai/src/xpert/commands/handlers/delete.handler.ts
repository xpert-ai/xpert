import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { DeleteResult, Not } from 'typeorm'
import { XpertService } from '../../xpert.service'
import { Xpert } from '../../xpert.entity'
import { XpertDeleteCommand } from '../delete.command'
import { XpertPublishTriggersCommand } from '../publish-triggers.command'

@CommandHandler(XpertDeleteCommand)
export class XpertDeleteHandler implements ICommandHandler<XpertDeleteCommand> {
    constructor(
        private readonly service: XpertService,
        private readonly commandBus: CommandBus
    ) {}

    public async execute(command: XpertDeleteCommand): Promise<DeleteResult> {
        const id = command.id

        const xpert = await this.service.findOne(id)
        await this.cleanupPublishedTriggers(xpert)
        if (xpert.latest) {
            const others = await this.service.findAll({
                where: {
                    type: xpert.type,
                    slug: xpert.slug,
                    id: Not(xpert.id)
                }
            })

            await this.service.repository.remove(others.items)
        }

        return await this.service.delete(id)
    }

    private async cleanupPublishedTriggers(xpert: Xpert): Promise<void> {
        if (!xpert.publishAt || !xpert.graph?.nodes?.length) {
            return
        }

        await this.commandBus.execute(
            new XpertPublishTriggersCommand(
                {
                    ...xpert,
                    graph: {
                        nodes: [],
                        connections: []
                    }
                },
                {
                    strict: false,
                    previousGraph: xpert.graph
                }
            )
        )
    }
}
