import { IUser } from '@xpert-ai/contracts'
import { Exclude, Expose } from 'class-transformer'

@Expose()
export class WorkspacePublicDTO {
	@Exclude()
	members?: IUser[]

	constructor(partial: Partial<WorkspacePublicDTO>) {
		Object.assign(this, partial)
	}
}
