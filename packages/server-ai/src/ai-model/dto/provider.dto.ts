import { I18nObject } from '@xpert-ai/contracts'
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
    @Transform(({ value, obj }) => providerIconUrls(obj, 'icon_small', value))
    icon_small?: I18nObject

    @Expose()
    @IsOptional()
    @ValidateNested()
    @Transform(({ value, obj }) => providerIconUrls(obj, 'icon_large', value))
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
        this.organizationQuery = this.organizationId ? `?organizationId=${encodeURIComponent(this.organizationId)}` : ''
        this.urlPrefix = baseUrl + (baseUrl.endsWith('/') ? '' : '/') + `api/ai-model/provider/${partial.provider}`
    }
}

// Share the public, organization-aware asset URLs with model selection metadata.
export function providerIconUrls(
    provider: Pick<AiProviderDto, 'urlPrefix' | 'organizationQuery'>,
    iconType: 'icon_small' | 'icon_large',
    icon?: I18nObject
): I18nObject | undefined {
    if (!icon || !provider.urlPrefix) return undefined
    return {
        en_US: `${provider.urlPrefix}/${iconType}/en_US${provider.organizationQuery ?? ''}`,
        zh_Hans: `${provider.urlPrefix}/${iconType}/zh_Hans${provider.organizationQuery ?? ''}`
    }
}
