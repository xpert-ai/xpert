import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Environment } from './environment.entity'
import { XpertWorkspaceBaseService } from '../xpert-workspace'

@Injectable()
export class EnvironmentService extends XpertWorkspaceBaseService<Environment> {
	private readonly logger = new Logger(EnvironmentService.name)

	constructor(
		@InjectRepository(Environment)
		readonly repository: Repository<Environment>
	) {
		super(repository)
	}

	async setAsDefault(id: string) {
		const env = await this.findOne(id)
		if (env.isDefault) {
			return
		}
		const {items} = await this.findAll({where: {workspaceId: env.workspaceId, isDefault: true}})
		for await (const other of items) {
			await this.update(other.id, {isDefault: false})
		}
		await this.update(env.id, {isDefault: true})
	}
}
