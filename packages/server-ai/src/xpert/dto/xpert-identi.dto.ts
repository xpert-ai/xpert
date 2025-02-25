import { IXpert, TAvatar } from '@metad/contracts'
import { Exclude, Expose } from 'class-transformer'
import { Xpert } from '../xpert.entity'

/**
 * IdentiDto: The minimum attributes that can be exposed to represent this object
 */
@Exclude()
export class XpertIdentiDto implements Partial<IXpert> {
    @Expose()
	id: string

	@Expose()
	slug: string

	@Expose()
	name: string

	@Expose()
	description: string

	@Expose()
	avatar?: TAvatar

	@Expose()
	title?: string

	@Expose()
	titleCN?: string

	constructor(partial: Partial<XpertIdentiDto | Xpert>) {
		Object.assign(this, partial)
	}
}
