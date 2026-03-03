import { I18nObject } from '@metad/contracts'
import { Exclude, Expose, Transform } from 'class-transformer'
import { IsOptional, IsString, ValidateNested } from 'class-validator'
import { RequestContext } from '@xpert-ai/plugin-sdk'

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
				en_US: `${obj.urlPrefix}/icon_small/en_US${obj.organizationQuery ?? ''}`,
				zh_Hans: `${obj.urlPrefix}/icon_small/zh_Hans${obj.organizationQuery ?? ''}`
			}
	)
	icon_small?: I18nObject

	@Expose()
	@IsOptional()
	@ValidateNested()
	@Transform(
		({ value, obj }) =>
			value && {
				en_US: `${obj.urlPrefix}/icon_large/en_US${obj.organizationQuery ?? ''}`,
				zh_Hans: `${obj.urlPrefix}/icon_large/zh_Hans${obj.organizationQuery ?? ''}`
			}
	)
	icon_large?: I18nObject

	@Exclude()
	urlPrefix?: string

	@Exclude()
	organizationId?: string

	@Exclude()
	organizationQuery?: string

	constructor(partial: Partial<AiProviderDto>, baseUrl: string, organizationId?: string) {
		Object.assign(this, partial)

		this.organizationId = organizationId ?? RequestContext.getOrganizationId()
		this.organizationQuery = this.organizationId
			? `?organizationId=${encodeURIComponent(this.organizationId)}`
			: ''
		this.urlPrefix = baseUrl + (baseUrl.endsWith('/') ? '' : '/') +  `api/ai-model/provider/${partial.provider}`
	}
}
