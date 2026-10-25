import { ContentIdentityService } from './content-identity.service'
import { ForbiddenException, Injectable } from '@nestjs/common'
import {
    ContentResourceProviderRegistry, ContentResourcesRuntimeCapability,
    type ContentResourceRequest, type ContentResourcesApi
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { RuntimeCapabilityProvider } from '../shared/runtime/runtime-capability-provider.decorator'

@Injectable()
@RuntimeCapabilityProvider(ContentResourcesRuntimeCapability)
export class ContentResourceService implements ContentResourcesApi {
    constructor(readonly identities: ContentIdentityService, private readonly providers: ContentResourceProviderRegistry) {}

    async authorize(input: ContentResourceRequest) {
        const principal = await this.identities.principal(input.actor)
        let provider
        try { provider = this.providers.get(input.providerKey, input.actor.organizationId) }
        catch { throw this.denied() }
        return provider.authorize({ ...input, principal })
    }

    private denied() { return new ForbiddenException(t('server-ai:Error.ContentAccessDenied')) }
}
