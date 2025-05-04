import { IUser, IXpertProjectFile } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude, Expose, Transform, TransformFnParams } from 'class-transformer'
import { IsObject, IsOptional } from 'class-validator'

@Exclude()
export class XpertProjectFileDto implements Partial<IXpertProjectFile> {

	@Expose()
	id?: string

	@Expose()
	projectId?: string

	@Expose()
	filePath?: string

	@Expose()
	fileType?: string

	@Expose()
	url?: string

	@Expose()
	description?: string

	@ApiProperty({ type: () => Object, readOnly: true })
	@IsOptional()
	@IsObject()
	@Expose()
	@Transform(({ value }: TransformFnParams) => value && new UserPublicDTO(value))
	readonly createdBy: IUser

	@ApiProperty({ type: () => Object, readOnly: true })
	@IsOptional()
	@IsObject()
	@Expose()
	@Transform(({ value }: TransformFnParams) => value && new UserPublicDTO(value))
	readonly owner: IUser

	constructor(partial: Partial<XpertProjectFileDto | IXpertProjectFile>) {
		Object.assign(this, partial)
	}
}
