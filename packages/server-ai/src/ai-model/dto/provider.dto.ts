import { I18nObject } from '@metad/contracts'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsOptional, IsString, ValidateNested } from 'class-validator'

@Expose()
export class AiProviderDto {
	
	@Expose()
	@IsString()
	provider: string

	@Expose()
	@IsString()
	background?: string

	@Expose()
	@ValidateNested()
	label: I18nObject
	
	@Expose()
	@IsOptional()
	@ValidateNested()
	@Transform(
		({ value, obj }) =>
			value && {
				en_US: `${obj.urlPrefix}/icon_small/en_US`,
				zh_Hans: `${obj.urlPrefix}/icon_small/zh_Hans`
			}
	)
	icon_small?: I18nObject

	@Expose()
	@IsOptional()
	@ValidateNested()
	@Transform(
		({ value, obj }) =>
			value && {
				en_US: `${obj.urlPrefix}/icon_large/en_US`,
				zh_Hans: `${obj.urlPrefix}/icon_large/zh_Hans`
			}
	)
	icon_large?: I18nObject

	@Exclude()
	urlPrefix?: string

	constructor(partial: Partial<AiProviderDto>, baseUrl: string) {
		Object.assign(this, partial)

		this.urlPrefix = baseUrl + (baseUrl.endsWith('/') ? '' : '/') +  `api/ai-model/provider/${partial.provider}`
	}
}
