import { IAiProviderEntity } from '@metad/contracts'
import { Expose, Exclude, Transform } from 'class-transformer'
import { AiProviderDto } from '../../ai-model'

@Expose()
export class CopilotProviderPublicDto {
	@Transform(({ value, obj }) => value && new AiProviderDto(value, obj.baseUrl))
	provider: IAiProviderEntity

	@Exclude()
	credentials?: Record<string, any>
	
	constructor(partial: Partial<CopilotProviderPublicDto>, private baseUrl: string) {
		Object.assign(this, partial)
	}
}
