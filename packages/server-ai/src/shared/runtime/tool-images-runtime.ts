import { BadRequestException } from '@nestjs/common'
import type { RuntimeIdentityScope, ToolImagesApi } from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { normalizeOptionalString } from './runtime-input'
import { ToolImageArtifacts } from './tool-image-artifacts'

/** Resolve child execution identity per call; never cache the first caller in a compiled middleware. */
export function createToolImagesApi(dependencies: {
    resolveScope: () => RuntimeIdentityScope
    createArtifacts: (scope: RuntimeIdentityScope) => ConstructorParameters<typeof ToolImageArtifacts>[0]
    createFiles: (scope: RuntimeIdentityScope) => ConstructorParameters<typeof ToolImageArtifacts>[1]
}): ToolImagesApi {
    const current = () => {
        const resolved = dependencies.resolveScope()
        const tenantId = normalizeOptionalString(resolved.tenantId)
        const organizationId = normalizeOptionalString(resolved.organizationId)
        const userId = normalizeOptionalString(resolved.userId)
        const conversationId = normalizeOptionalString(resolved.conversationId)
        if (!tenantId || !organizationId || !userId || !conversationId) {
            throw new BadRequestException(
                t('server-ai:Error.ToolImageScopeRequired', {
                    defaultValue:
                        'Tool images require an authenticated execution with a bound conversation and workspace.'
                })
            )
        }
        const scope = { ...resolved, tenantId, organizationId, userId, conversationId }
        return new ToolImageArtifacts(dependencies.createArtifacts(scope), dependencies.createFiles(scope), scope, {
            pluginName: '@xpert-ai/platform',
            resourceType: 'tool-image',
            presentationSource: 'tool'
        })
    }
    return {
        save: async (input) => current().save(input),
        prepareModelInput: async (messages, toolNames) => current().prepareModelInput(messages, toolNames)
    }
}
