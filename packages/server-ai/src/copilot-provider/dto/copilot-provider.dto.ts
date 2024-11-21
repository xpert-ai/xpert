import { IAiProviderEntity } from '@metad/contracts'
import { Expose, Transform } from 'class-transformer'
import { AiProviderDto } from '../../ai-model'

@Expose()
export class CopilotProviderDto {
	@Transform(({ value, obj }) => value && new AiProviderDto(value, obj.baseUrl))
	provider: IAiProviderEntity

	constructor(partial: Partial<CopilotProviderDto>, private baseUrl: string) {
		Object.assign(this, partial)
	}
}
