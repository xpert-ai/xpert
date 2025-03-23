import { IUser, IXpertToolset, TToolCredentials, TXpertToolsetOptions } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'

@Expose()
export class ToolsetPublicDTO implements IXpertToolset {
	name: string
	
	@Exclude()
	declare options: TXpertToolsetOptions

	@Exclude()
	declare credentials?: TToolCredentials

	@Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
	@Expose()
	createdBy?: IUser

	@Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
	@Expose()
	updatedBy?: IUser

	constructor(partial: Partial<ToolsetPublicDTO>) {
		Object.assign(this, partial)
	}
}
