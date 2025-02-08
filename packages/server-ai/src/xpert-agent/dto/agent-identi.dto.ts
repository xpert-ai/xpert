import { IXpertAgent, TAvatar } from '@metad/contracts'
import { Exclude, Expose } from 'class-transformer'

/**
 * IdentiDto: The minimum attributes that can be exposed to represent this object
 */
@Exclude()
export class XpertAgentIdentiDto implements Partial<IXpertAgent> {
    @Expose()
	id: string

	@Expose()
	key: string

	@Expose()
	name: string

	@Expose()
	title: string

	@Expose()
	description: string

	@Expose()
	avatar?: TAvatar

	constructor(partial: Partial<XpertAgentIdentiDto | IXpertAgent>) {
		Object.assign(this, partial)
	}
}
