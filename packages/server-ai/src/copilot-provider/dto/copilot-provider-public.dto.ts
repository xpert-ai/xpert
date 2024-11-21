import { IAiProviderEntity } from '@metad/contracts'
import { Expose, Exclude, Transform } from 'class-transformer'
import { AiProviderDto } from '../../ai-model'

@Expose()
export class CopilotProviderPublicDto {
	@Transform(({ value }) => value && new AiProviderDto(value))
	provider: IAiProviderEntity

	@Exclude()
	credentials?: Record<string, any>
	
	constructor(partial: Partial<CopilotProviderPublicDto>) {
		Object.assign(this, partial)
	}
}
