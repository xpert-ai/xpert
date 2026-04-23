import { createXpertId, IProjectCore, ProjectCoreStatusEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, UpdateResult } from 'typeorm'
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity'
import { normalizeRequiredBrandedId } from '../shared/utils'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { ProjectCore } from './project-core.entity'

@Injectable()
export class ProjectCoreService extends TenantOrganizationAwareCrudService<ProjectCore> {
	constructor(
		@InjectRepository(ProjectCore)
		protected readonly repository: Repository<ProjectCore>,
		private readonly publishedXpertAccessService: PublishedXpertAccessService
	) {
		super(repository)
	}

	override async create(entity: Partial<IProjectCore>, ...options: unknown[]) {
		const name = entity.name?.trim()
		const goal = entity.goal?.trim()
		const description = entity.description?.trim()
		const mainAssistantId = normalizeRequiredBrandedId(
			entity.mainAssistantId,
			'mainAssistantId',
			createXpertId,
			{
				missingMessage: 'mainAssistantId is required for a project'
			}
		)

		if (!name) {
			throw new BadRequestException('name is required for a project')
		}

		if (!goal) {
			throw new BadRequestException('goal is required for a project')
		}

		if (entity.status && entity.status !== ProjectCoreStatusEnum.Active) {
			throw new BadRequestException('Only active status is supported when creating a project')
		}

		await this.validateMainAssistant(mainAssistantId)

		return super.create(
			{
				...entity,
				name,
				goal,
				description: description || undefined,
				mainAssistantId,
				status: ProjectCoreStatusEnum.Active,
			},
			...options
		)
	}

	override async update(
		id: string,
		partialEntity: QueryDeepPartialEntity<ProjectCore>,
		...options: unknown[]
	): Promise<UpdateResult | ProjectCore> {
		const nextEntity: QueryDeepPartialEntity<ProjectCore> = {
			...partialEntity
		}

		if (typeof partialEntity.name === 'string') {
			const name = partialEntity.name.trim()
			if (!name) {
				throw new BadRequestException('name is required for a project')
			}
			nextEntity.name = name
		}

		if (typeof partialEntity.goal === 'string') {
			const goal = partialEntity.goal.trim()
			if (!goal) {
				throw new BadRequestException('goal is required for a project')
			}
			nextEntity.goal = goal
		}

		if (typeof partialEntity.description === 'string') {
			const description = partialEntity.description.trim()
			nextEntity.description = description || null
		}

		if (Object.prototype.hasOwnProperty.call(partialEntity, 'mainAssistantId')) {
			const mainAssistantId = normalizeRequiredBrandedId(
				partialEntity['mainAssistantId'],
				'mainAssistantId',
				createXpertId,
				{
					missingMessage: 'mainAssistantId cannot be cleared once it is set',
					blankMessage: 'mainAssistantId is required for a project'
				}
			)
			await this.validateMainAssistant(mainAssistantId)
			nextEntity.mainAssistantId = mainAssistantId
		}

		await super.update(id, nextEntity, ...options)
		return this.findOne(id)
	}

	private async validateMainAssistant(mainAssistantId: IProjectCore['mainAssistantId'] | string) {
		const assistant = await this.publishedXpertAccessService.getAccessiblePublishedXpert(mainAssistantId)
		if (assistant.type !== XpertTypeEnum.Agent || assistant.latest !== true) {
			throw new BadRequestException('Selected main assistant must be a published agent Xpert')
		}
	}
}
