import { IOrganization, IUser } from '@metad/contracts'
import { OrganizationPublicDTO, UserPublicDTO } from '@metad/server-core'
import { Expose, Transform } from 'class-transformer'

@Expose()
export class PublicCopilotUserDto {
	@Transform(({ value }) => value && new UserPublicDTO(value))
	user: IUser

	@Transform(({ value }) => value && new OrganizationPublicDTO(value))
	org: IOrganization

	constructor(partial: Partial<PublicCopilotUserDto>) {
		Object.assign(this, partial)
	}
}
