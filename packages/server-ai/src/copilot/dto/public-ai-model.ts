import { ProviderModel } from '@metad/contracts'
import { Exclude, Expose } from 'class-transformer'

@Expose()
export class PublicAIModelDto {

	@Exclude()
	model_properties: ProviderModel['model_properties']
    
	@Exclude()
	parameter_rules: any
    
	@Exclude()
	pricing: any

	constructor(partial: Partial<PublicAIModelDto>) {
		Object.assign(this, partial)
	}
}
