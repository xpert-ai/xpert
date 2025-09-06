import { IUser } from '@metad/contracts'
import { PaginationParams, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FindOptionsWhere, IsNull, Not } from 'typeorm'
import { GetXpertWorkspaceQuery } from './queries'
import { WorkspaceBaseEntity } from '../core/entities/base.entity'

@Injectable()
export class XpertWorkspaceBaseService<T extends WorkspaceBaseEntity> extends TenantOrganizationAwareCrudService<T> {
	readonly #logger = new Logger(XpertWorkspaceBaseService.name)

	@Inject(CommandBus)
	readonly commandBus: CommandBus
	@Inject(QueryBus)
	readonly queryBus: QueryBus

	async getAllByWorkspace(workspaceId: string, data: PaginationParams<T>, published: boolean, user: IUser) {
		const { relations, order, take } = data ?? {}
		let { where } = data ?? {}
		where = where ?? {}
		if (workspaceId === 'null' || workspaceId === 'undefined' || !workspaceId) {
			where = {
				...(<FindOptionsWhere<T>>where),
				workspaceId: IsNull(),
				createdById: user.id
			}
		} else {
			const workspace = await this.queryBus.execute(new GetXpertWorkspaceQuery(user, { id: workspaceId }))
			if (!workspace) {
				throw new NotFoundException(`Not found or no auth for xpert workspace '${workspaceId}'`)
			}

			where = {
				...(<FindOptionsWhere<T>>where),
				workspaceId: workspaceId
			}
		}
		if (published) {
			where.publishAt = Not(IsNull())
		}

		return this.findAll({
			where,
			relations,
			order,
			take
		})
	}
}
