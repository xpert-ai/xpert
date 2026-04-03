import { ISkillPackage, ISkillRepositoryIndex, IUser, TSkillPackage } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { Exclude, Expose, Transform } from 'class-transformer'
import { SimpleSkillIndexDto } from '../../skill-repository/dto'

@Expose()
export class SimpleSkillPackageDTO implements Partial<ISkillPackage> {
	@Exclude()
	declare instructions: TSkillPackage['instructions']

	@Exclude()
	declare resources: TSkillPackage['resources']

	@Transform(({ value }) => (value ? new SimpleSkillIndexDto(value) : null))
	@Expose()
	skillIndex?: ISkillRepositoryIndex

	@Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
	@Expose()
	createdBy?: IUser

	@Transform(({ value }) => (value ? new UserPublicDTO(value) : null))
	@Expose()
	updatedBy?: IUser

	constructor(partial: Partial<SimpleSkillPackageDTO>) {
		Object.assign(this, partial)
	}
}
