import { BusinessAreaRole, BusinessType } from '@xpert-ai/contracts'
import { BusinessArea } from '../business-area.entity'

export class BusinessAreaDTO {
	id: string

	type?: BusinessType

	name?: string

	parentId?: string

	role: BusinessAreaRole

	constructor(partial: Partial<BusinessAreaDTO | BusinessArea>, role?: BusinessAreaRole) {
		Object.assign(this, partial)
		this.role = role
	}
}
