import {
	IProjectSprint,
	ProjectSprintStatusEnum,
	ProjectSprintStrategyEnum
} from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository, UpdateResult } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { ProjectCore } from '../project-core/project-core.entity'
import { ProjectSwimlaneService } from '../project-swimlane/project-swimlane.service'
import { ProjectSprint } from './project-sprint.entity'

@Injectable()
export class ProjectSprintService extends TenantOrganizationAwareCrudService<ProjectSprint> {
	constructor(
		@InjectRepository(ProjectSprint)
		protected readonly repository: Repository<ProjectSprint>,
		@InjectRepository(ProjectCore)
		private readonly projectCoreRepository: Repository<ProjectCore>,
		@InjectDataSource()
		private readonly dataSource: DataSource,
		private readonly swimlaneService: ProjectSwimlaneService
	) {
		super(repository)
	}

	override async create(entity: Partial<IProjectSprint>, ...options: unknown[]) {
		if (!entity.projectId) {
			throw new BadRequestException('projectId is required for a sprint')
		}
		if (!entity.strategyType) {
			throw new BadRequestException('strategyType is required for a sprint')
		}

		await this.ensureProjectExists(entity.projectId)
		this.swimlaneService.getStrategyTemplateOrFail(entity.strategyType)

		return this.dataSource.transaction(async (manager) => {
			const repository = manager.getRepository(ProjectSprint)
			const sprint = repository.create(
				this.writeToCurrentScope({
					...entity,
					status: entity.status ?? ProjectSprintStatusEnum.Planned
				})
			)
			const savedSprint = await repository.save(sprint)
			await this.swimlaneService.createDefaultsForSprint(savedSprint, manager)
			return savedSprint
		})
	}

	override async update(
		id: string,
		partialEntity: QueryDeepPartialEntity<ProjectSprint>,
		...options: unknown[]
	): Promise<UpdateResult | ProjectSprint> {
		const sprint = await this.findOne(id)

		if (partialEntity.projectId && partialEntity.projectId !== sprint.projectId) {
			throw new BadRequestException('Changing a sprint projectId is not supported')
		}

		if (partialEntity.strategyType && partialEntity.strategyType !== sprint.strategyType) {
			throw new BadRequestException('Changing sprint strategyType is not supported')
		}

		if (partialEntity.strategyType) {
			this.swimlaneService.getStrategyTemplateOrFail(partialEntity.strategyType as ProjectSprintStrategyEnum)
		}

		await super.update(id, partialEntity, ...options)
		return this.findOne(id)
	}

	private async ensureProjectExists(projectId: IProjectSprint['projectId']) {
		const project = await this.projectCoreRepository.findOneBy({ id: projectId })
		if (!project) {
			throw new BadRequestException(`Project ${projectId} was not found`)
		}
	}
}
