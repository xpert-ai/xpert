import { IXpert, resolveRuntimeXpert } from '@xpert-ai/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { XpertService } from '../../xpert.service'
import { FindXpertQuery } from '../get-one.query'

@QueryHandler(FindXpertQuery)
export class FindXpertHandler implements IQueryHandler<FindXpertQuery> {
    constructor(private readonly service: XpertService) {}

    public async execute(command: FindXpertQuery): Promise<IXpert> {
        const { conditions, params } = command
        const { relations, isDraft } = params ?? {}
        const xpert = await this.service.findOne({ where: conditions, relations })
        return resolveRuntimeXpert(xpert, Boolean(isDraft))
    }
}
