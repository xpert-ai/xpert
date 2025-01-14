import { IAiProviderEntity, ICopilot, TCopilotProviderPublicDto } from '@metad/contracts'
import { Exclude, Expose, Transform } from 'class-transformer'
import { AiProviderIdentiDto } from '../../ai-model'
import { CopilotDto } from '../../copilot/dto'

@Expose()
export class CopilotProviderPublicDto implements TCopilotProviderPublicDto {
	@Transform(({ value, obj }) => value && new AiProviderIdentiDto(value, obj.baseUrl))
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
