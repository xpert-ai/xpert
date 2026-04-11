import { IOrganization, IUser } from '@xpert-ai/contracts'
import { OrganizationPublicDTO, UserPublicDTO } from '@xpert-ai/server-core'
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
