import { IUser, IXpert, IXpertProject, IXpertToolset } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { Expose, Transform, TransformFnParams } from 'class-transformer'
import { IsObject, IsOptional } from 'class-validator'
import { XpertIdentiDto } from '../../xpert/dto'
import { ToolsetPublicDTO } from '../../xpert-toolset/dto'

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

	@Expose()
	@Transform(({ value }) => value?.map((_) => new ToolsetPublicDTO(_)))
	toolsets?: IXpertToolset[]

	constructor(partial: Partial<XpertProjectDto | IXpertProject>) {
		Object.assign(this, partial)
	}
}
