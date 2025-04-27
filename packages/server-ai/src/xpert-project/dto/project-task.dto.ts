import { IUser, IXpertProjectTask } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { ApiProperty } from '@nestjs/swagger'
import { Expose, Transform, TransformFnParams } from 'class-transformer'
import { IsObject, IsOptional } from 'class-validator'

@Expose()
export class XpertProjectTaskDto implements Partial<IXpertProjectTask> {
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

	constructor(partial: Partial<XpertProjectTaskDto | IXpertProjectTask>) {
		Object.assign(this, partial)
	}
}
