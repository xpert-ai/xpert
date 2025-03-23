import { IUser, IXpert, IXpertAgent, TAvatar, XpertTypeEnum } from '@metad/contracts'
import { UserPublicDTO } from '@metad/server-core'
import { Exclude, Expose, Transform, TransformFnParams } from 'class-transformer'
import { XpertAgentIdentiDto } from '../../xpert-agent/dto'
import { Xpert } from '../xpert.entity'

/**
 * IdentiDto: The minimum attributes that can be exposed to represent this object
 */
@Exclude()
export class XpertIdentiDto implements Partial<IXpert> {
	@Expose()
	id: string

	@Expose()
	slug: string

	@Expose()
	name: string

	@Expose()
	type: XpertTypeEnum

	@Expose()
	description: string

	@Expose()
	avatar?: TAvatar

	@Expose()
	title?: string

	@Expose()
	titleCN?: string

	@Expose()
	@Transform((params: TransformFnParams) => (params.value ? new XpertAgentIdentiDto(params.value) : null))
	agent?: IXpertAgent

	@Expose()
	@Transform((params: TransformFnParams) => params.value?.map((_) => new XpertAgentIdentiDto(_)))
	agents?: IXpertAgent[]

	@Expose()
	@Transform(({ value }: TransformFnParams) => value && new UserPublicDTO(value))
	createdBy?: IUser

	constructor(partial: Partial<XpertIdentiDto | Xpert>) {
		Object.assign(this, partial)
	}
}
