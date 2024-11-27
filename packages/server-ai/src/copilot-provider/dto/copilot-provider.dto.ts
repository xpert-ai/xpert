import { IAiProviderEntity, ICopilot } from '@metad/contracts'
import { Expose, Transform } from 'class-transformer'
import { AiProviderDto } from '../../ai-model'
import { CopilotDto } from '../../copilot/dto'

@Expose()
export class CopilotProviderDto {
	@Transform(({ value, obj }) => value && new AiProviderDto(value, obj.baseUrl))
	provider: IAiProviderEntity
	
	@Transform(({ value, obj }) => value && new CopilotDto(value, obj.baseUrl))
	copilot: ICopilot

	constructor(partial: Partial<CopilotProviderDto>, private baseUrl: string) {
		Object.assign(this, partial)
	}
}
