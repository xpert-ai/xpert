import { IProjectCore } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
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
		return super.create(entity, ...options)
	}
}
