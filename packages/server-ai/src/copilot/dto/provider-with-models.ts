import { ModelCredentialSchema, ProviderCredentialSchema, ProviderModel } from '@metad/contracts'
import { Exclude, Expose, Transform } from 'class-transformer'
import { PublicAIModelDto } from './public-ai-model'
import { AiProviderDto } from '../../ai-model'

@Expose()
export class ProviderWithModelsDto extends AiProviderDto {

	@Exclude()
	model_credential_schema: ModelCredentialSchema

	@Exclude()
	provider_credential_schema: ProviderCredentialSchema

	@Transform(({ value }) => value && value.map((_) => new PublicAIModelDto(_)))
	models: ProviderModel[]

	constructor(partial: Partial<ProviderWithModelsDto>, baseUrl: string) {
		super(partial, baseUrl)
		Object.assign(this, partial)
	}
}
