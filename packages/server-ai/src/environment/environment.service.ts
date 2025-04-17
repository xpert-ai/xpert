import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Not, Repository } from 'typeorm'
import { XpertWorkspaceBaseService } from '../xpert-workspace'
import { Environment } from './environment.entity'

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
		const { items } = await this.findAll({ where: { workspaceId: env.workspaceId, isDefault: true } })
		for await (const other of items) {
			await this.update(other.id, { isDefault: false })
		}
		await this.update(env.id, { isDefault: true })
	}

	async getDefaultByWorkspace(workspaceId: string) {
		const { items } = await this.findAll({
			where: [
				{ workspaceId, isDefault: true, isArchived: false },
				{ workspaceId, isDefault: true, isArchived: IsNull() }
			]
		})
		if (items.length > 0) {
			return items[0]
		} else {
			this.logger.warn(`No default environment found for workspaceId: ${workspaceId}`)
			return null
		}
	}
}
