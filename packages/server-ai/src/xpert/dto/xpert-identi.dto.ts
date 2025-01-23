import { TAvatar } from '@metad/contracts'
import { Exclude, Expose } from 'class-transformer'
import { Xpert } from '../xpert.entity'

/**
 * IdentiDto: The minimum attributes that can be exposed to represent this object
 */
@Exclude()
export class XpertIdentiDto {
    @Expose()
	id: string

	@Expose()
	name: string

	@Expose()
	description: string

	@Expose()
	avatar?: TAvatar

	constructor(partial: Partial<XpertIdentiDto | Xpert>) {
		Object.assign(this, partial)
	}
}
