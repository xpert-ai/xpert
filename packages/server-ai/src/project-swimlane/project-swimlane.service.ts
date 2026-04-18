import {
	IProjectSprint,
	IProjectSprintStrategyTemplate,
	IProjectSwimlane,
	ProjectAgentRole,
	ProjectExecutionEnvironmentType,
	ProjectSwimlaneKindEnum,
	ProjectSystemSwimlaneKeyEnum,
	ProjectSprintStrategyEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository, UpdateResult } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { ProjectSprint } from '../project-sprint/project-sprint.entity'
import { ProjectSwimlane } from './project-swimlane.entity'
import { PROJECT_SPRINT_STRATEGY_TEMPLATES } from './project-swimlane.templates'

@Injectable()
export class ProjectSwimlaneService extends TenantOrganizationAwareCrudService<ProjectSwimlane> {
	constructor(
		@InjectRepository(ProjectSwimlane)
		protected readonly repository: Repository<ProjectSwimlane>,
		@InjectRepository(ProjectSprint)
		private readonly sprintRepository: Repository<ProjectSprint>
	) {
		super(repository)
	}

	getStrategyTemplates(): IProjectSprintStrategyTemplate[] {
		return PROJECT_SPRINT_STRATEGY_TEMPLATES
	}

	getStrategyTemplate(strategyType: ProjectSprintStrategyEnum) {
		return PROJECT_SPRINT_STRATEGY_TEMPLATES.find((template) => template.type === strategyType)
	}

	getStrategyTemplateOrFail(strategyType: ProjectSprintStrategyEnum) {
		const template = this.getStrategyTemplate(strategyType)
		if (!template) {
			throw new BadRequestException(`Unsupported sprint strategy: ${strategyType}`)
		}
		return template
	}

	buildDefaultSwimlanes(sprint: Pick<IProjectSprint, 'id' | 'projectId' | 'strategyType'>): Partial<IProjectSwimlane>[] {
		const template = this.getStrategyTemplateOrFail(sprint.strategyType)

		return [
			this.buildReservedBacklogSwimlane(sprint),
			...template.swimlanes.map((lane) => ({
				projectId: sprint.projectId,
				sprintId: sprint.id,
				...lane
			}))
		]
	}

	async createDefaultsForSprint(
		sprint: Pick<IProjectSprint, 'id' | 'projectId' | 'strategyType'>,
		manager?: EntityManager
	) {
		const repository = manager?.getRepository(ProjectSwimlane) ?? this.repository
		const swimlanes = this.buildDefaultSwimlanes(sprint).map((lane) => repository.create(lane))

		return repository.save(swimlanes)
	}

	buildReservedBacklogSwimlane(
		sprint: Pick<IProjectSprint, 'id' | 'projectId' | 'strategyType'>
	): Partial<IProjectSwimlane> {
		return {
			projectId: sprint.projectId,
			sprintId: sprint.id,
			key: ProjectSystemSwimlaneKeyEnum.Backlog,
			name: 'Backlog',
			kind: ProjectSwimlaneKindEnum.Backlog,
			priority: 0,
			weight: 0,
			concurrencyLimit: 0,
			wipLimit: 0,
			agentRole: ProjectAgentRole.Planner,
			environmentType: ProjectExecutionEnvironmentType.Browser,
			sortOrder: 0,
			sourceStrategyType: sprint.strategyType
		}
	}

	async ensureReservedBacklogLane(sprintId: string, manager?: EntityManager) {
		const sprintRepository = manager?.getRepository(ProjectSprint) ?? this.sprintRepository
		const repository = manager?.getRepository(ProjectSwimlane) ?? this.repository
		const sprint = await sprintRepository.findOneBy({ id: sprintId })
		if (!sprint) {
			throw new BadRequestException(`Sprint ${sprintId} was not found`)
		}

		const existingLane = await repository.findOne({
			where: [
				{
					sprintId,
					kind: ProjectSwimlaneKindEnum.Backlog
				},
				{
					sprintId,
					key: ProjectSystemSwimlaneKeyEnum.Backlog
				}
			]
		})
		if (existingLane) {
			return existingLane
		}

		const backlogLane = repository.create(this.buildReservedBacklogSwimlane(sprint))
		return repository.save(backlogLane)
	}

	override async create(entity: Partial<IProjectSwimlane>, ...options: unknown[]) {
		const normalizedEntity = await this.normalizeSwimlane(entity)
		return super.create(normalizedEntity, ...options)
	}

	override async update(
		id: string,
		partialEntity: QueryDeepPartialEntity<ProjectSwimlane>,
		...options: unknown[]
	): Promise<UpdateResult | ProjectSwimlane> {
		const current = await this.findOne(id)
		if (partialEntity.kind && partialEntity.kind !== current.kind) {
			throw new BadRequestException('Changing swimlane kind is not supported')
		}
		if (partialEntity.key && partialEntity.key !== current.key) {
			throw new BadRequestException('Changing swimlane key is not supported')
		}
		const nextProjectId =
			typeof partialEntity.projectId === 'string' ? partialEntity.projectId : current.projectId
		const nextSprintId =
			typeof partialEntity.sprintId === 'string' ? partialEntity.sprintId : current.sprintId
		const nextSourceStrategyType =
			typeof partialEntity.sourceStrategyType === 'string'
				? partialEntity.sourceStrategyType
				: current.sourceStrategyType

		await this.normalizeSwimlane({
			...current,
			projectId: nextProjectId,
			sprintId: nextSprintId,
			kind: current.kind ?? ProjectSwimlaneKindEnum.Execution,
			key: current.key,
			sourceStrategyType: nextSourceStrategyType
		})

		await super.update(id, partialEntity, ...options)
		return this.findOne(id)
	}

	private async normalizeSwimlane(entity: Partial<IProjectSwimlane>) {
		if (!entity.projectId || !entity.sprintId) {
			throw new BadRequestException('projectId and sprintId are required for a swimlane')
		}
		if (!entity.kind) {
			throw new BadRequestException('kind is required for a swimlane')
		}
		if (!entity.sourceStrategyType) {
			throw new BadRequestException('sourceStrategyType is required for a swimlane')
		}

		this.getStrategyTemplateOrFail(entity.sourceStrategyType)

		const sprint = await this.sprintRepository.findOneBy({ id: entity.sprintId })
		if (!sprint) {
			throw new BadRequestException(`Sprint ${entity.sprintId} was not found`)
		}
		if (sprint.projectId !== entity.projectId) {
			throw new BadRequestException('Swimlane sprintId must belong to the same projectId')
		}

		if (entity.kind === ProjectSwimlaneKindEnum.Backlog) {
			if (entity.key !== ProjectSystemSwimlaneKeyEnum.Backlog) {
				throw new BadRequestException('Reserved backlog swimlane must use the backlog key')
			}
			if (entity.sortOrder !== 0) {
				throw new BadRequestException('Reserved backlog swimlane must use sortOrder 0')
			}
			if (entity.concurrencyLimit !== 0 || entity.wipLimit !== 0) {
				throw new BadRequestException('Reserved backlog swimlane must not expose execution concurrency')
			}
		}

		if (
			entity.kind === ProjectSwimlaneKindEnum.Execution &&
			entity.key === ProjectSystemSwimlaneKeyEnum.Backlog
		) {
			throw new BadRequestException('Execution swimlanes cannot reuse the reserved backlog key')
		}

		return entity
	}
}
