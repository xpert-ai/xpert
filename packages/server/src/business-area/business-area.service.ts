import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { CreateBusinessAreaInput, IPagination, UpdateBusinessAreaInput } from '@xpert-ai/contracts'
import { t } from 'i18next'
import type { FindManyOptions, Repository } from 'typeorm'

import { TenantOrganizationAwareCrudService } from '../core'
import { BusinessArea } from './business-area.entity'

@Injectable()
export class BusinessAreaService extends TenantOrganizationAwareCrudService<BusinessArea> {
	constructor(
		@InjectRepository(BusinessArea)
		repository: Repository<BusinessArea>
	) {
		super(repository)
	}

	override findAll(options?: FindManyOptions<BusinessArea>): Promise<IPagination<BusinessArea>> {
		return super.findAll({
			...options,
			order: options?.order ?? { name: 'ASC' }
		})
	}

	async createArea(input: CreateBusinessAreaInput): Promise<BusinessArea> {
		const name = this.requireName(input.name)
		const parent = input.parentId ? await this.findOneByIdString(input.parentId) : null
		return super.create({
			name,
			parentId: parent?.id ?? null,
			parent
		})
	}

	async updateArea(id: string, input: UpdateBusinessAreaInput): Promise<BusinessArea> {
		const area = await this.findOneByIdString(id)
		if (input.name !== undefined) {
			area.name = this.requireName(input.name)
		}
		if (input.parentId !== undefined) {
			const parent = input.parentId ? await this.validateParent(id, input.parentId) : null
			area.parentId = parent?.id ?? null
			area.parent = parent
		}
		return this.repository.save(area)
	}

	async deleteArea(id: string) {
		await this.findOneByIdString(id)
		return this.delete(id)
	}

	private requireName(value: string): string {
		const name = typeof value === 'string' ? value.trim() : ''
		if (!name) {
			throw new BadRequestException(
				t('server-ai:Error.BusinessAreaNameRequired', {
					defaultValue: 'Business area name is required.'
				})
			)
		}
		return name
	}

	private async validateParent(id: string, parentId: string): Promise<BusinessArea> {
		if (id === parentId) {
			throw new BadRequestException(
				t('server-ai:Error.BusinessAreaCannotParentSelf', {
					defaultValue: 'A business area cannot be its own parent.'
				})
			)
		}

		let parent = await this.findOneByIdString(parentId)
		const selectedParent = parent
		const visited = new Set<string>()
		while (parent.parentId && !visited.has(parent.id)) {
			visited.add(parent.id)
			if (parent.parentId === id) {
				throw new BadRequestException(
					t('server-ai:Error.BusinessAreaCannotParentDescendant', {
						defaultValue: 'A business area cannot be moved below one of its descendants.'
					})
				)
			}
			parent = await this.findOneByIdString(parent.parentId)
		}
		return selectedParent
	}
}
