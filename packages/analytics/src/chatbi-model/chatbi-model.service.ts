import { IXpert, IIntegration } from '@metad/contracts'
import { XpertService } from '@metad/server-ai'
import { IntegrationService, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository, UpdateResult } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { ChatBIModel } from './chatbi-model.entity'

@Injectable()
export class ChatBIModelService extends TenantOrganizationAwareCrudService<ChatBIModel> {
	private readonly logger = new Logger(ChatBIModelService.name)

	constructor(
		@InjectRepository(ChatBIModel)
		repository: Repository<ChatBIModel>,
		private readonly roleService: XpertService,
		private readonly integrationService: IntegrationService,
		readonly commandBus: CommandBus
	) {
		super(repository)
	}

	async visit(modelId: string, entity: string) {
		const record = await this.findOneByConditions({ modelId, entity })
		record.visits = (record.visits ?? 0) + 1
		await this.repository.save(record)
	}

	// async updateRoles(modelId: string, roles: string[]) {
	// 	const model = await super.findOne({ where: { id: modelId }, relations: ['roles'] })

	// 	const _roles = await this.roleService.findAll({
	// 		where: {
	// 			id: In(roles)
	// 		}
	// 	})

	// 	model.xperts = _roles.items
	// 	return await this.repository.save(model)
	// }

	async update(modelId: string, entity: QueryDeepPartialEntity<ChatBIModel>): Promise<UpdateResult | ChatBIModel> {
		const { integrations, xperts, ...updateEntity } = entity
		const model = await super.findOne({ where: { id: modelId }, relations: ['integrations'] })
		if (integrations) {
			const _integrations = await this.integrationService.findAll({
				where: {
					id: In((<QueryDeepPartialEntity<IIntegration>[]>integrations).map(({ id }) => id))
				}
			})

			model.integrations = _integrations.items
		}

		// if (xperts) {
		// 	const _roles = await this.roleService.findAll({
		// 		where: {
		// 			id: In((<QueryDeepPartialEntity<IXpert>[]>xperts).map(({ id }) => id))
		// 		}
		// 	})

		// 	model.xperts = _roles.items
		// }
		await this.repository.save(model)
		return await super.update(modelId, updateEntity)
	}
}
