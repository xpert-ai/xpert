import { IXpertProject } from '@metad/contracts'
import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FindXpertQuery } from '../xpert/queries'
import { XpertProject } from './project.entity'

@Injectable()
export class XpertProjectService extends TenantOrganizationAwareCrudService<XpertProject> {
	readonly #logger = new Logger(XpertProjectService.name)

	constructor(
		@InjectRepository(XpertProject)
		repository: Repository<XpertProject>,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(repository)
	}

	async getXperts(id: string, params: PaginationParams<IXpertProject>) {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const project = await this.repository.findOne({
			where: {
				id,
				tenantId,
				organizationId
			},
			relations: ['xperts']
		})

		const total = project.xperts.length
		const xperts = params.take ? project.xperts.slice(params.skip, params.skip + params.take) : project.xperts

		return {
			items: xperts,
			total
		}
	}

	async addXpert(id: string, xpertId: string) {
		const project = await this.findOne({
			where: { id },
			relations: ['xperts']
		})

		const xpertExists = project.xperts.some((xpert) => xpert.id === xpertId)
		if (xpertExists) {
			this.#logger.warn(`Xpert with id ${xpertId} already exists in project ${id}`)
			return project
		}

		const xpert = await this.queryBus.execute(new FindXpertQuery({ id: xpertId }))

		project.xperts.push(xpert) // Assuming xpert is an entity with at least an id field
		await this.repository.save(project)

		return project
	}

	async removeXpert(id: string, xpertId: string) {
		const project = await this.findOne({
			where: { id },
			relations: ['xperts']
		})

		const xpertIndex = project.xperts.findIndex((xpert) => xpert.id === xpertId)
		if (xpertIndex === -1) {
			this.#logger.warn(`Xpert with id ${xpertId} does not exist in project ${id}`)
			return project
		}

		project.xperts.splice(xpertIndex, 1)
		await this.repository.save(project)

		return project
	}
}
