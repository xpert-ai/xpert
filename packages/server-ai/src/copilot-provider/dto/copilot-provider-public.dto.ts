import { IAiProviderEntity, ICopilot } from '@metad/contracts'
import { Expose, Exclude, Transform } from 'class-transformer'
import { AiProviderDto } from '../../ai-model'
import { CopilotDto } from '../../copilot/dto'

@Expose()
export class CopilotProviderPublicDto {
	@Transform(({ value, obj }) => value && new AiProviderDto(value, obj.baseUrl))
	provider: IAiProviderEntity

	@Exclude()
	credentials?: Record<string, any>

	@Transform(({ value, obj }) => value && new CopilotDto(value, obj.baseUrl))
	copilot: ICopilot

	@Exclude()
	baseUrl: string
	
	constructor(partial: Partial<CopilotProviderPublicDto>, baseUrl: string) {
		Object.assign(this, partial)

		this.baseUrl = baseUrl
	}
}
