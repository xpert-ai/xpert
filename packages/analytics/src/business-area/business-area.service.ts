import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { Repository, TreeRepository } from 'typeorm'
import { BusinessArea } from './business-area.entity'
import { BusinessAreaUser, BusinessAreaUserService } from '../business-area-user'

@Injectable()
export class BusinessAreaService extends TenantOrganizationAwareCrudService<BusinessArea> {
	constructor(
		@InjectRepository(BusinessArea)
		bgRepository: Repository<BusinessArea>,
		@InjectRepository(BusinessArea)
		private treeRepository: TreeRepository<BusinessArea>,

		private readonly bauService: BusinessAreaUserService
	) {
		super(bgRepository)
	}

	async findDescendants(entity: BusinessArea) {
		return this.treeRepository.findDescendants(entity)
	}

	/**
	 * 获取当前用户对此 business area 的权限
	 *
	 * @param businessArea
	 */
	async getAccess(businessArea: BusinessArea): Promise<BusinessAreaUser> {
		const userId = RequestContext.currentUserId()

		const { items: businessAreaUsers } = await this.bauService.findAll({
			where: { userId },
		})

		let bau = businessAreaUsers.find((item) => item.businessAreaId === businessArea.id)
		if (bau) {
			return bau
		} else {
			const ancestors = await this.treeRepository.findAncestors(businessArea)
			for (const ancestor of ancestors) {
				bau = businessAreaUsers.find((item) => item.businessAreaId === ancestor.id)
				if (bau) {
					return bau
				}
			}
		}
	}

	async getMeInBusinessArea(id: string) {
		const businessArea = await this.findOne(id)
		return await this.getAccess(businessArea)
	}
}
