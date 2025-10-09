import { ICopilot } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Copilot } from '../../copilot.entity'
import { CopilotGetOneQuery } from '../get-one.query'

@QueryHandler(CopilotGetOneQuery)
export class CopilotGetOneHandler implements IQueryHandler<CopilotGetOneQuery> {
	constructor(
		@InjectRepository(Copilot)
		private readonly repository: Repository<Copilot>
	) {}

	public async execute(command: CopilotGetOneQuery): Promise<ICopilot> {
		const tenantId = command.tenantId
		// Regardless of organization restrictions when get copilot by id
		return await this.repository.findOne({ where: { id: command.id, tenantId }, relations: command.relations })
	}
}
