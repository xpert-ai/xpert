import { convertToUrlPath, IUser, TXpertTeamDraft } from '@metad/contracts'
import {
	OptionParams,
	PaginationParams,
	RequestContext,
	TenantOrganizationAwareCrudService,
	UserPublicDTO,
	UserService
} from '@metad/server-core'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { assign, uniq, uniqBy } from 'lodash'
import { FindConditions, In, IsNull, Not, Repository } from 'typeorm'
import { GetXpertWorkspaceQuery, MyXpertWorkspaceQuery } from '../xpert-workspace'
import { XpertPublishCommand } from './commands'
import { Xpert } from './xpert.entity'
import { XpertPublicDTO } from './dto'

@Injectable()
export class XpertService extends TenantOrganizationAwareCrudService<Xpert> {
	readonly #logger = new Logger(XpertService.name)

	constructor(
		@InjectRepository(Xpert)
		repository: Repository<Xpert>,
		private readonly userService: UserService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(repository)
	}

	/**
	 * To solve the problem that Update cannot create OneToOne relation, it is uncertain whether using save to update might pose risks
	 */
	async update(id: string, entity: Partial<Xpert>) {
		const _entity = await super.findOne(id)
		assign(_entity, entity)
		return await this.repository.save(_entity)
	}

	async validateTitle(title: string) {
		const name = convertToUrlPath(title)
		const { items } = await this.findAll({
			where: {
				name,
				latest: true
			}
		})

		return items
	}

	async getAllByWorkspace(workspaceId: string, data: PaginationParams<Xpert>, published: boolean, user: IUser) {
		const { relations, order, take } = data ?? {}
		let { where } = data ?? {}
		where = where ?? {}
		if (workspaceId === 'null' || workspaceId === 'undefined' || !workspaceId) {
			where = {
				...(<FindConditions<Xpert>>where),
				workspaceId: IsNull(),
				createdById: user.id
			}
		} else {
			const workspace = await this.queryBus.execute(new GetXpertWorkspaceQuery(user, { id: workspaceId }))
			if (!workspace) {
				throw new NotFoundException(`Not found or no auth for xpert workspace '${workspaceId}'`)
			}

			where = {
				...(<FindConditions<Xpert>>where),
				workspaceId: workspaceId
			}
		}
		if (published) {
			where.version = Not(IsNull())
		}

		return this.findAll({
			where,
			relations,
			order,
			take
		})
	}

	async getMyAll(params: PaginationParams<Xpert>) {
		const userId = RequestContext.currentUserId();
		const {items: userWorkspaces} = await this.queryBus.execute(new MyXpertWorkspaceQuery(userId, {}))

		const { relations, order, take } = params ?? {};
		let { where } = params ?? {};
		where = where ?? {};

		where = {
			...(<FindConditions<Xpert>>where),
			createdById: userId
		};

		const xpertsCreatedByUser = await this.findAll({
			where,
			relations,
			order,
			take
		})
		
		const baseQuery = this.repository.createQueryBuilder('xpert')
			.innerJoin('xpert.managers', 'manager', 'manager.id = :userId', { userId })
		// add relations
		relations?.forEach((relation) => baseQuery.leftJoinAndSelect('xpert.' + relation, relation))
		if (order) {
			Object.keys(order).forEach((name) => {
				baseQuery.addOrderBy(`xpert.${name}`, order[name])
			})
		}
		const xpertsManagedByUser = await baseQuery.where(params.where ?? {})
			.take(take)
			.getMany();

		const xpertsInUserWorkspaces = await this.repository.find({
			where: {
				...(params.where ?? {}),
				workspaceId: In(userWorkspaces.map(workspace => workspace.id))
			},
			relations,
			order,
			take
		});

		const allXperts = uniqBy([
			...xpertsCreatedByUser.items,
			...xpertsManagedByUser,
			...xpertsInUserWorkspaces
		], 'id')

		return {
			items: allXperts.map((item) => new XpertPublicDTO(item)),
			total: allXperts.length
		};
	}

	async getTeam(id: string, options?: OptionParams<Xpert>) {
		const { relations } = options ?? {}
		const team = await this.findOne(id, {
			relations: uniq([...(relations ?? []), 'agents', 'toolsets', 'knowledgebases'])
		})
		return team
	}

	async save(entity: Xpert) {
		return await this.repository.save(entity)
	}

	async saveDraft(id: string, draft: TXpertTeamDraft) {
		const xpert = await this.findOne(id)
		xpert.draft = {
			...draft,
			team: {
				...draft.team,
				updatedAt: new Date(),
				updatedById: RequestContext.currentUserId()
			}
		} as TXpertTeamDraft

		await this.repository.save(xpert)
		return xpert.draft
	}

	async updateDraft(id: string, draft: TXpertTeamDraft) {
		const xpert = await this.findOne(id)
		xpert.draft = {
			...(xpert.draft ?? {}),
			...draft,
			team: {
				...(xpert.draft?.team ?? {}),
				...(draft.team ?? {}),
				updatedAt: new Date(),
				updatedById: RequestContext.currentUserId()
			}
		} as TXpertTeamDraft

		await this.repository.save(xpert)
		return xpert.draft
	}

	async publish(id: string) {
		return await this.commandBus.execute(new XpertPublishCommand(id))
	}

	async allVersions(id: string) {
		const role = await this.findOne(id)
		const { items: allVersions } = await this.findAll({
			where: {
				workspaceId: role.workspaceId ?? IsNull(),
				name: role.name
			}
		})

		return allVersions.map((item) => ({
			id: item.id,
			version: item.version,
			latest: item.latest,
			publishAt: item.publishAt
		}))
	}

	async deleteXpert(id: string) {
		const xpert = await this.findOne(id)

		if (xpert.latest) {
			// Delete all versions if it is latest version
			return await this.softDelete({ name: xpert.name, deletedAt: IsNull() })
		} else {
			// Delete current version team
			return await this.softDelete(xpert.id)
		}
	}

	async updateManagers(id: string, ids: string[]) {
		const xpert = await this.findOne(id, { relations: ['managers'] })
		const { items } = await this.userService.findAll({ where: { id: In(ids) } })
		xpert.managers = items
		await this.repository.save(xpert)
		return xpert.managers.map((u) => new UserPublicDTO(u))
	}

	async removeManager(id: string, userId: string) {
		const xpert = await this.findOne(id, { relations: ['managers'] })
		if (!xpert) {
			throw new NotFoundException(`Xpert with id ${id} not found`)
		}

		const managerIndex = xpert.managers.findIndex(manager => manager.id === userId)
		if (managerIndex === -1) {
			throw new NotFoundException(`Manager with id ${userId} not found in Xpert ${id}`)
		}

		xpert.managers.splice(managerIndex, 1)
		await this.repository.save(xpert)
	}
}
