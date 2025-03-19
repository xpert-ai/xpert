import { IXpert, IXpertAgent, TAvatar } from '@metad/contracts'
import { Exclude, Expose, TransformFnParams, Transform } from 'class-transformer'
import { Xpert } from '../xpert.entity'
import { XpertAgentIdentiDto } from '../../xpert-agent/dto'

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

	constructor(partial: Partial<XpertIdentiDto | Xpert>) {
		Object.assign(this, partial)
	}
}
