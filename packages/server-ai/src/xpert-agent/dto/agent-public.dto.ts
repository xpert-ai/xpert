import { Exclude, Expose } from 'class-transformer'
import { XpertAgentIdentiDto } from './agent-identi.dto'
import { TXpertParameter } from '@metad/contracts'

@Exclude()
export class XpertAgentPublicDTO extends XpertAgentIdentiDto {

	@Expose()
	parameters?: TXpertParameter[]

	constructor(partial: Partial<XpertAgentPublicDTO | XpertAgentIdentiDto>) {
		super(partial)
	}
}
