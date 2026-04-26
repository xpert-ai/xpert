import {
	createProjectId,
	createTeamId,
	IProjectTeamBinding,
	ProjectAgentRole,
	ProjectExecutionEnvironmentType
} from '@xpert-ai/contracts'
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

type ProjectTeamBindingNormalizeInput = {
	projectId?: unknown
	teamId?: unknown
	role?: unknown
	sortOrder?: unknown
	agentRoles?: unknown
	environmentTypes?: unknown
	swimlaneKeys?: unknown
	assignmentPriority?: unknown
	maxConcurrentTasks?: unknown
}

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
		const hasAgentRolesUpdate = Object.prototype.hasOwnProperty.call(partialEntity, 'agentRoles')
		const hasEnvironmentTypesUpdate = Object.prototype.hasOwnProperty.call(partialEntity, 'environmentTypes')
		const hasSwimlaneKeysUpdate = Object.prototype.hasOwnProperty.call(partialEntity, 'swimlaneKeys')
		const hasAssignmentPriorityUpdate = Object.prototype.hasOwnProperty.call(partialEntity, 'assignmentPriority')
		const hasMaxConcurrentTasksUpdate = Object.prototype.hasOwnProperty.call(partialEntity, 'maxConcurrentTasks')
		const normalizedEntity = await this.normalizeBindingInput(
			{
				projectId: nextProjectId,
				teamId: nextTeamId,
				role: hasRoleUpdate
					? typeof partialEntity.role === 'string'
							? partialEntity.role
							: undefined
					: current.role,
				sortOrder: typeof partialEntity.sortOrder === 'number' ? partialEntity.sortOrder : current.sortOrder,
				agentRoles: hasAgentRolesUpdate ? partialEntity.agentRoles : current.agentRoles,
				environmentTypes: hasEnvironmentTypesUpdate
					? partialEntity.environmentTypes
					: current.environmentTypes,
				swimlaneKeys: hasSwimlaneKeysUpdate ? partialEntity.swimlaneKeys : current.swimlaneKeys,
				assignmentPriority:
					hasAssignmentPriorityUpdate && typeof partialEntity.assignmentPriority === 'number'
						? partialEntity.assignmentPriority
						: current.assignmentPriority,
				maxConcurrentTasks: hasMaxConcurrentTasksUpdate
					? partialEntity.maxConcurrentTasks
					: current.maxConcurrentTasks
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
				sortOrder: normalizedEntity.sortOrder,
				agentRoles: normalizedEntity.agentRoles,
				environmentTypes: normalizedEntity.environmentTypes ?? null,
				swimlaneKeys: normalizedEntity.swimlaneKeys ?? null,
				assignmentPriority: normalizedEntity.assignmentPriority,
				maxConcurrentTasks: normalizedEntity.maxConcurrentTasks ?? null
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
		entity: ProjectTeamBindingNormalizeInput,
		current?: ProjectTeamBinding
	): Promise<Partial<IProjectTeamBinding>> {
		const projectId = normalizeRequiredBrandedId(entity.projectId, 'projectId', createProjectId, {
			missingMessage: 'projectId is required for a team binding'
		})
		const teamId = normalizeRequiredBrandedId(entity.teamId, 'teamId', createTeamId, {
			missingMessage: 'teamId is required for a team binding'
		})
		const role = typeof entity.role === 'string' ? entity.role.trim() : undefined
		const agentRoles = normalizeProjectAgentRoles(entity.agentRoles)
		const environmentTypes = normalizeProjectEnvironmentTypes(entity.environmentTypes)
		const swimlaneKeys = normalizeOptionalStringList(entity.swimlaneKeys, 'swimlaneKeys')
		const assignmentPriority =
			typeof entity.assignmentPriority === 'number' && Number.isInteger(entity.assignmentPriority)
				? entity.assignmentPriority
				: 0
		const maxConcurrentTasks = normalizeOptionalPositiveInteger(
			entity.maxConcurrentTasks,
			'maxConcurrentTasks'
		)

		if (current && projectId !== current.projectId) {
			throw new BadRequestException('Changing a team binding projectId is not supported')
		}

		const [project, team] = await Promise.all([
			this.projectCoreService.findOne(projectId),
			this.teamDefinitionService.findOne(teamId)
		])
		if (project.mainAssistantId && team.leadAssistantId === project.mainAssistantId) {
			throw new BadRequestException('Project team binding cannot target the project main assistant')
		}

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
			projectId,
			teamId,
			role: role || undefined,
			sortOrder,
			agentRoles,
			environmentTypes,
			swimlaneKeys,
			assignmentPriority,
			maxConcurrentTasks
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

const PROJECT_AGENT_ROLE_VALUES = new Set<string>(Object.values(ProjectAgentRole))
const PROJECT_ENVIRONMENT_TYPE_VALUES = new Set<string>(Object.values(ProjectExecutionEnvironmentType))

function normalizeProjectAgentRoles(value: unknown): ProjectAgentRole[] {
	if (value === undefined || value === null) {
		return []
	}
	if (!Array.isArray(value)) {
		throw new BadRequestException('agentRoles must be an array')
	}

	return [...new Set(value.map((item) => normalizeProjectAgentRole(item)))]
}

function normalizeProjectAgentRole(value: unknown): ProjectAgentRole {
	if (typeof value !== 'string' || !PROJECT_AGENT_ROLE_VALUES.has(value)) {
		throw new BadRequestException('agentRoles contains an unsupported project agent role')
	}
	return value as ProjectAgentRole
}

function normalizeProjectEnvironmentTypes(value: unknown): ProjectExecutionEnvironmentType[] | null {
	if (value === undefined || value === null) {
		return null
	}
	if (!Array.isArray(value)) {
		throw new BadRequestException('environmentTypes must be an array')
	}

	const normalized = [...new Set(value.map((item) => normalizeProjectEnvironmentType(item)))]
	return normalized.length ? normalized : null
}

function normalizeProjectEnvironmentType(value: unknown): ProjectExecutionEnvironmentType {
	if (typeof value !== 'string' || !PROJECT_ENVIRONMENT_TYPE_VALUES.has(value)) {
		throw new BadRequestException('environmentTypes contains an unsupported environment type')
	}
	return value as ProjectExecutionEnvironmentType
}

function normalizeOptionalStringList(value: unknown, field: string): string[] | null {
	if (value === undefined || value === null) {
		return null
	}
	if (!Array.isArray(value)) {
		throw new BadRequestException(`${field} must be an array`)
	}

	const normalized = [
		...new Set(
			value.map((item) => {
				if (typeof item !== 'string') {
					throw new BadRequestException(`${field} must contain only strings`)
				}
				return item.trim()
			}).filter((item) => item.length > 0)
		)
	]

	return normalized.length ? normalized : null
}

function normalizeOptionalPositiveInteger(value: unknown, field: string): number | null {
	if (value === undefined || value === null) {
		return null
	}
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		throw new BadRequestException(`${field} must be a positive integer`)
	}
	return value
}
