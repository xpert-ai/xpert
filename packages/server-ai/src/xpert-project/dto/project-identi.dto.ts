import { IUser, IXpert, IXpertProject, IXpertToolset, TAvatar, TXpertProjectStatus } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude, Expose, Transform, TransformFnParams } from 'class-transformer'
import { IsObject, IsOptional } from 'class-validator'
import { XpertIdentiDto } from '../../xpert/dto'
import { ToolsetPublicDTO } from '../../xpert-toolset/dto'

@Exclude()
export class XpertProjectIdentiDto implements Partial<IXpertProject> {
	@Expose()
	id: string

	@Expose()
	name: string

	@Expose()
	description?: string

	@Expose()
	avatar?: TAvatar

	@Expose()
	status: TXpertProjectStatus

	@Expose()
	@ApiProperty({ type: () => Object, readOnly: true })
	@IsOptional()
	@IsObject()
	@Transform(({ value }: TransformFnParams) => value && new UserPublicDTO(value))
	readonly createdBy: IUser

	@Expose()
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

	constructor(partial: Partial<XpertProjectIdentiDto | IXpertProject>) {
		Object.assign(this, partial)
	}
}
