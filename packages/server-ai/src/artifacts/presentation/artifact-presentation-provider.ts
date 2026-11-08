import { ServiceUnavailableException } from '@nestjs/common'
import {
    ArtifactPresentationRegistry,
    artifactPresentationKey,
    type ArtifactPresentationContext
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { ArtifactTypesService } from '../types/artifact-types.service'

/** Resolve the source's pinned plugin installation; never fall back to another registration. */
export function artifactPresentationProvider(
    registry: ArtifactPresentationRegistry,
    types: ArtifactTypesService,
    context: ArtifactPresentationContext
) {
    const binding = context.artifact.typeBinding
    const unavailable = () =>
        new ServiceUnavailableException({
            code: 'ARTIFACT_PRESENTATION_UNAVAILABLE',
            message: t('server-ai:Error.ArtifactPresentationUnavailable')
        })
    if (!binding || types.provider(context.artifact).definition.presentation.mode !== 'authenticated')
        throw unavailable()
    const registration = registry
        .listAllRegistrations()
        .find(
            (item) =>
                item.type === artifactPresentationKey(context.artifact) && item.source.scopeKey === binding.scopeKey
        )
    if (
        !registration ||
        registration.source.kind !== 'plugin' ||
        registration.source.pluginName !== context.artifact.pluginName
    )
        throw unavailable()
    return registration.strategy
}
