import { TenantOrganizationAwareCrudService } from '@metad/server-core'
import { forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { assign } from 'lodash'
import { FindConditions, In, IsNull, Repository } from 'typeorm'
import { KnowledgebaseService } from '../knowledgebase'
import { XpertRole } from './xpert-role.entity'
import { IUser } from '@metad/contracts'
import { GetXpertWorkspaceQuery } from '../xpert-workspace'

@Injectable()
export class XpertRoleService extends TenantOrganizationAwareCrudService<XpertRole> {
	readonly #logger = new Logger(XpertRoleService.name)

	constructor(
		@InjectRepository(XpertRole)
		repository: Repository<XpertRole>,
		@Inject(forwardRef(() => KnowledgebaseService))
		private readonly knowledgebaseService: KnowledgebaseService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(repository)
	}

	async update(id: string, entity: Partial<XpertRole>) {
		const _entity = await super.findOne(id)
		assign(_entity, entity)
		return await this.repository.save(_entity)
	}

	async getAllByWorkspace(workspaceId: string, data, user: IUser) {
		const { relations, order, take } = data ?? {}
		let { where } = data ?? {}
		where = where ?? {}
		if (workspaceId === 'null' || workspaceId === 'undefined' || !workspaceId) {
			where = {
				...(<FindConditions<XpertRole>>where),
				workspaceId: IsNull(),
				createdById: user.id
			}
		} else {
			const workspace = await this.queryBus.execute(new GetXpertWorkspaceQuery(user, { id: workspaceId }))
			if (!workspace) {
				throw new NotFoundException(`Not found or no auth for xpert workspace '${workspaceId}'`)
			}

			where = {
				...(<FindConditions<XpertRole>>where),
				workspaceId: workspaceId
			}
		}

		return this.findAll({
			where,
			relations,
			order,
			take
		})
	}
}
