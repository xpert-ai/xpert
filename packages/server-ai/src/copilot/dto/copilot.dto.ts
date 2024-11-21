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

	@Transform(({ value }) => value && new CopilotProviderPublicDto(value))
	modelProvider?: ICopilotProvider

	constructor(partial: Partial<CopilotDto>) {
		Object.assign(this, partial)
	}
}
