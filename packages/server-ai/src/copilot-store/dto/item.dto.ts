import { IUser } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { Expose, Transform } from 'class-transformer'

@Expose()
export class StoreItemDTO {
    
	@Expose()
	@Transform(({ value }) => new UserPublicDTO(value))
	createdBy: IUser

	constructor(partial: Partial<StoreItemDTO>) {
		Object.assign(this, partial)
	}
}
