import { ICopilotProvider } from '@metad/contracts'
import { Expose, Exclude, Transform } from 'class-transformer'
import { CopilotProviderPublicDto } from '../../copilot-provider/dto'

@Expose()
export class CopilotDto {

	id: string

	@Exclude()
	apiKey?: string

	@Exclude()
	secretKey?: string

	@Transform(({ value, obj }) => value && new CopilotProviderPublicDto(value, obj.baseUrl))
	modelProvider?: ICopilotProvider

	constructor(partial: Partial<CopilotDto>, private baseUrl: string) {
		Object.assign(this, partial)
	}
}
