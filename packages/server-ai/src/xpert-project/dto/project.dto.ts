import { IUser, IXpert, IXpertProject } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { Expose, Transform, TransformFnParams } from 'class-transformer'
import { IsObject, IsOptional } from 'class-validator'
import { XpertIdentiDto } from '../../xpert/dto'

@Expose()
export class XpertProjectDto implements Partial<IXpertProject> {
	@ApiProperty({ type: () => Object, readOnly: true })
	@IsOptional()
	@IsObject()
	@Transform(({ value }: TransformFnParams) => value && new UserPublicDTO(value))
	readonly createdBy: IUser

	@ApiProperty({ type: () => Object, readOnly: true })
	@IsOptional()
	@IsObject()
	@Transform(({ value }: TransformFnParams) => value && new UserPublicDTO(value))
	readonly owner: IUser

	@Expose()
	@Transform(({ value }) => value?.map((_) => new XpertIdentiDto(_)))
	xperts?: IXpert[]

	constructor(partial: Partial<XpertProjectDto | IXpertProject>) {
		Object.assign(this, partial)
	}
}
