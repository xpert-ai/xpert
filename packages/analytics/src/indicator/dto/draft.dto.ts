import { IndicatorType } from '@metad/contracts'
import { Expose } from 'class-transformer'
import { Indicator } from '../indicator.entity'

export class IndicatorDraftDTO {
	@Expose()
	code?: string
	@Expose()
	name?: string
	@Expose()
	type?: IndicatorType
	@Expose()
	visible?: boolean
	@Expose()
	isApplication?: boolean
	@Expose()
	modelId?: string
	@Expose()
	entity?: string
	@Expose()
	unit?: string
	@Expose()
	principal?: string
	@Expose()
	certificationId?: string
	@Expose()
	validity?: string
	@Expose()
	business?: string
	@Expose()
	businessAreaId?: string

	@Expose()
	options?: any

	constructor(partial: Partial<IndicatorDraftDTO | Indicator>) {
		Object.assign(this, partial)
	}
}
