import { IUser, IXpertProjectFile } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { Exclude, Expose, Transform, TransformFnParams } from 'class-transformer'
import { IsObject, IsOptional } from 'class-validator'

@Expose()
export class XpertProjectFileDto implements Partial<IXpertProjectFile> {

	@Exclude()
	fileContents?: string

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

	constructor(partial: Partial<XpertProjectFileDto | IXpertProjectFile>) {
		Object.assign(this, partial)
	}
}
