import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { KnowledgebaseService } from '../knowledgebase'
import { CopilotRole } from './copilot-role.entity'

/**
 * @deprecated use Xpert
 */
@Injectable()
export class CopilotRoleService extends TenantOrganizationAwareCrudService<CopilotRole> {
	readonly #logger = new Logger(CopilotRoleService.name)

	constructor(
		@InjectRepository(CopilotRole)
		repository: Repository<CopilotRole>,
		@Inject(forwardRef(() => KnowledgebaseService))
		private readonly knowledgebaseService: KnowledgebaseService,
		private readonly commandBus: CommandBus
	) {
		super(repository)
	}

	async updateKnowledgebases(roleId: string, knowledgebases: string[]): Promise<CopilotRole> {
		const role = await super.findOne({ where: { id: roleId }, relations: ['knowledgebases'] })
		const _knowledgebases = await this.knowledgebaseService.findAll({
			where: {
				id: In(knowledgebases)
			}
		})

		role.knowledgebases = _knowledgebases.items
		return await this.repository.save(role)
	}
}
