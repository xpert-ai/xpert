import { convertToUrlPath, IUser, IXpertAgentExecution, LongTermMemoryTypeEnum, TMemoryQA, TMemoryUserProfile, TXpertTeamDraft } from '@metad/contracts'
import {
	OptionParams,
	PaginationParams,
	RequestContext,
	TenantOrganizationAwareCrudService,
	transformWhere,
	UserPublicDTO,
	UserService
} from '@metad/server-core'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { assign, uniq, uniqBy } from 'lodash'
import { FindConditions, In, IsNull, Not, Repository } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import { GetXpertWorkspaceQuery, MyXpertWorkspaceQuery } from '../xpert-workspace'
import { XpertPublishCommand } from './commands'
import { Xpert } from './xpert.entity'
import { XpertIdentiDto } from './dto'
import { GetXpertMemoryEmbeddingsQuery } from './queries'
import { CopilotMemoryStore, CreateCopilotStoreCommand } from '../copilot-store'

@Injectable()
export class XpertService extends TenantOrganizationAwareCrudService<Xpert> {
	readonly #logger = new Logger(XpertService.name)

	constructor(
		@InjectRepository(Xpert)
		public readonly repository: Repository<Xpert>,
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

	/**
	 * Verify the uniqueness of the slug generated by Name in the system to ensure that it is unique across the entire database
	 * 
	 * @param name 
	 * @returns 
	 */
	async validateName(name: string) {
		const slug = convertToUrlPath(name)
		if (slug.length < 5) {
			return false
		}
		const count = await this.repository.count({
			where: {
				slug,
				latest: true
			}
		})

		return !count
	}

	async getAllByWorkspace(workspaceId: string, data: PaginationParams<Xpert>, published: boolean, user: IUser) {
		const { relations, order, take } = data ?? {}
		let { where } = data ?? {}
		where = transformWhere(where ?? {})
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
			publishAt: Not(IsNull()),
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
		const xpertsManagedByUser = await baseQuery.where(
			{
				...(params.where ?? {}), 
				publishAt: Not(IsNull()),
				tenantId: RequestContext.currentTenantId(),
				organizationId: RequestContext.getOrganizationId()
			})
			.take(take)
			.getMany();

		const xpertsInUserWorkspaces = await this.repository.find({
			where: {
				...(params.where ?? {}),
				publishAt: Not(IsNull()),
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
			items: allXperts.map((item) => new XpertIdentiDto(item)),
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

	async publish(id: string, newVersion: boolean, environmentId: string, notes: string) {
		return await this.commandBus.execute(new XpertPublishCommand(id, newVersion, environmentId, notes))
	}

	async allVersions(id: string) {
		const xpert = await this.findOne(id)
		const { items: allVersions } = await this.findAll({
			where: {
				workspaceId: xpert.workspaceId ?? IsNull(),
				type: xpert.type,
				slug: xpert.slug,
			}
		})

		return allVersions.map((item) => ({
			id: item.id,
			version: item.version,
			latest: item.latest,
			publishAt: item.publishAt,
			releaseNotes: item.releaseNotes,
		}))
	}

	async setAsLatest(id: string) {
		const xpert = await this.findOne(id)
		if (!xpert.latest) {
			const { items: xperts } = await this.findAll({
				where: {
					workspaceId: xpert.workspaceId ?? IsNull(),
					type: xpert.type,
					slug: xpert.slug,
					latest: true
				}
			})

			xperts.forEach((item) => item.latest = false)
			xpert.latest = true
			await this.repository.save([...xperts, xpert])
		}
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

	async findBySlug(slug: string, relations?: string[]) {
		return await this.repository.findOne({
			where: {
				slug,
				latest: true,
				publishAt: Not(IsNull())
			},
			relations: uniq((relations ?? []).concat(['user', 'createdBy', 'organization']))
		})
	}

	async createMemory(xpertId: string, body:  {type: LongTermMemoryTypeEnum; value: TMemoryQA | TMemoryUserProfile}) {
		const xpert = await this.findOne(xpertId, { relations: ['agent'] })
		const memory = xpert.memory
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const execution: IXpertAgentExecution = {}
		const embeddings = await this.queryBus.execute(
			new GetXpertMemoryEmbeddingsQuery(tenantId, organizationId, memory, {
				tokenCallback: (token) => {
					execution.embedTokens += token ?? 0
				}
			})
		)
		const store = await this.commandBus.execute<CreateCopilotStoreCommand, CopilotMemoryStore>(new CreateCopilotStoreCommand({
			index: {
				dims: null,
				embeddings,
				fields: ['question', ]
			}
		}))

		const memoryKey = uuidv4()
		await store.put([xpertId, body.type || LongTermMemoryTypeEnum.QA], memoryKey, body.value)
	}
}
