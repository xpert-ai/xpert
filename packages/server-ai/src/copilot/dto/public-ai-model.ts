import { ModelPropertyKey, ProviderModel } from '@metad/contracts'
import { Exclude, Expose, Transform } from 'class-transformer'

@Expose()
export class PublicAIModelDto {
	@Transform(({ value }) => sanitizeModelProperties(value), { toPlainOnly: true })
	model_properties?: ProviderModel['model_properties']
    
	@Exclude()
	parameter_rules: any
    
	@Exclude()
	pricing: any

	constructor(partial: Partial<PublicAIModelDto>) {
		Object.assign(this, partial)
	}
}

function sanitizeModelProperties(modelProperties?: ProviderModel['model_properties']) {
	const contextSize = normalizeContextSize(modelProperties?.[ModelPropertyKey.CONTEXT_SIZE])
	if (typeof contextSize === 'number') {
		return {
			[ModelPropertyKey.CONTEXT_SIZE]: contextSize
		}
	}

	return undefined
}

function normalizeContextSize(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
		return Math.floor(value)
	}
	if (typeof value === 'string') {
		const parsed = Number.parseInt(value, 10)
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed
		}
	}
	return undefined
}
