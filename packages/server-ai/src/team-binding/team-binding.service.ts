import { createProjectId, createTeamId, IProjectTeamBinding } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DeleteResult, FindOptionsWhere, Repository, UpdateResult } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { ProjectCoreService } from '../project-core/project-core.service'
import { ProjectTask } from '../project-task/project-task.entity'
import { normalizeRequiredBrandedId } from '../shared/utils'
import { TeamDefinitionService } from '../team-definition/team-definition.service'
import { ProjectTeamBinding } from './project-team-binding.entity'

@Injectable()
export class TeamBindingService extends TenantOrganizationAwareCrudService<ProjectTeamBinding> {
	constructor(
		@InjectRepository(ProjectTeamBinding)
		protected readonly repository: Repository<ProjectTeamBinding>,
		@InjectRepository(ProjectTask)
		private readonly projectTaskRepository: Repository<ProjectTask>,
		private readonly projectCoreService: ProjectCoreService,
		private readonly teamDefinitionService: TeamDefinitionService
	) {
		super(repository)
	}

	override async create(entity: Partial<IProjectTeamBinding>, ...options: unknown[]) {
		const normalizedEntity = await this.normalizeBindingInput(entity)
		return super.create(normalizedEntity, ...options)
	}

	override async update(
		id: string,
		partialEntity: QueryDeepPartialEntity<ProjectTeamBinding>,
		...options: unknown[]
	): Promise<UpdateResult | ProjectTeamBinding> {
		const current = await this.findOne(id)
		if (typeof partialEntity.teamId === 'string' && partialEntity.teamId !== current.teamId) {
			throw new BadRequestException('Changing a team binding teamId is not supported')
		}
		const hasRoleUpdate = Object.prototype.hasOwnProperty.call(partialEntity, 'role')
		const nextProjectId =
			typeof partialEntity.projectId === 'string' ? partialEntity.projectId : current.projectId
		const nextTeamId = typeof partialEntity.teamId === 'string' ? partialEntity.teamId : current.teamId
		const normalizedEntity = await this.normalizeBindingInput(
			{
				projectId: nextProjectId,
				teamId: nextTeamId,
				role: hasRoleUpdate
					? typeof partialEntity.role === 'string'
						? partialEntity.role
						: undefined
					: current.role,
				sortOrder: typeof partialEntity.sortOrder === 'number' ? partialEntity.sortOrder : current.sortOrder
			},
			current
		)

		await super.update(
			id,
			{
				...partialEntity,
				projectId: normalizedEntity.projectId,
				teamId: normalizedEntity.teamId,
				role: normalizedEntity.role ?? null,
				sortOrder: normalizedEntity.sortOrder
			},
			...options
		)

		return this.findOne(id)
	}

	override async delete(criteria: string | FindOptionsWhere<ProjectTeamBinding>, options?: unknown): Promise<DeleteResult> {
		const bindingId =
			typeof criteria === 'string'
				? criteria
				: typeof criteria.id === 'string'
					? criteria.id
					: null
		if (!bindingId) {
			throw new BadRequestException('Team binding id is required for deletion')
		}
		const binding = await this.findOne(bindingId)
		const usageCount = await this.projectTaskRepository.countBy({
			projectId: binding.projectId,
			teamId: binding.teamId
		})

		if (usageCount > 0) {
			throw new ConflictException('This team is still referenced by project tasks and cannot be unbound')
		}

		return super.delete(bindingId, options)
	}

	async listByProject(projectId: IProjectTeamBinding['projectId'] | string) {
		const normalizedProjectId = normalizeRequiredBrandedId(
			projectId,
			'projectId',
			createProjectId,
			{
				missingMessage: 'projectId is required for a team binding'
			}
		)
		await this.projectCoreService.findOne(normalizedProjectId)
		return this.findAllInOrganizationOrTenant({
			where: { projectId: normalizedProjectId },
			order: {
				sortOrder: 'ASC',
				createdAt: 'ASC'
			}
		})
	}

	private async normalizeBindingInput(
		entity: Partial<IProjectTeamBinding>,
		current?: ProjectTeamBinding
	): Promise<Partial<IProjectTeamBinding>> {
		const projectId = normalizeRequiredBrandedId(entity.projectId, 'projectId', createProjectId, {
			missingMessage: 'projectId is required for a team binding'
		})
		const teamId = normalizeRequiredBrandedId(entity.teamId, 'teamId', createTeamId, {
			missingMessage: 'teamId is required for a team binding'
		})
		const role = entity.role?.trim()

		if (current && projectId !== current.projectId) {
			throw new BadRequestException('Changing a team binding projectId is not supported')
		}

		await this.projectCoreService.findOne(projectId)
		await this.teamDefinitionService.findOne(teamId)

		const duplicate = await this.repository.findOne({
			where: {
				projectId,
				teamId
			}
		})
		if (duplicate && duplicate.id !== current?.id) {
			throw new ConflictException('This team is already bound to the selected project')
		}

		const sortOrder =
			typeof entity.sortOrder === 'number' && entity.sortOrder >= 0
				? entity.sortOrder
				: await this.getNextSortOrder(projectId, current?.id)

		return {
			...entity,
			projectId,
			teamId,
			role: role || undefined,
			sortOrder
		}
	}

	private async getNextSortOrder(projectId: IProjectTeamBinding['projectId'], currentBindingId?: string) {
		const bindings = await this.repository.find({
			where: { projectId },
			order: { sortOrder: 'DESC', createdAt: 'DESC' },
			take: 1
		})
		const [lastBinding] = currentBindingId ? bindings.filter((binding) => binding.id !== currentBindingId) : bindings
		return lastBinding ? lastBinding.sortOrder + 1 : 0
	}
}
