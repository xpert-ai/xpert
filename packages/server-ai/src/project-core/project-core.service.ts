import { IProjectCore, ProjectCoreStatusEnum } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProjectCore } from './project-core.entity'

@Injectable()
export class ProjectCoreService extends TenantOrganizationAwareCrudService<ProjectCore> {
	constructor(
		@InjectRepository(ProjectCore)
		protected readonly repository: Repository<ProjectCore>
	) {
		super(repository)
	}

	override async create(entity: Partial<IProjectCore>, ...options: unknown[]) {
		const name = entity.name?.trim()
		const goal = entity.goal?.trim()
		const description = entity.description?.trim()

		if (!name) {
			throw new BadRequestException('name is required for a project')
		}

		if (!goal) {
			throw new BadRequestException('goal is required for a project')
		}

		if (entity.status && entity.status !== ProjectCoreStatusEnum.Active) {
			throw new BadRequestException('Only active status is supported when creating a project')
		}

		return super.create(
			{
				...entity,
				name,
				goal,
				description: description || undefined,
				status: ProjectCoreStatusEnum.Active,
			},
			...options
		)
	}
}
