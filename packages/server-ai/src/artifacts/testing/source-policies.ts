import { Reflector, DiscoveryService } from '@nestjs/core'
import { ArtifactTypeRegistry, FILE_ARTIFACT_TYPE, type IArtifactTypeProvider } from '@xpert-ai/plugin-sdk'
import type { ArtifactTypeReference } from '@xpert-ai/contracts'
import { ArtifactTypesService } from '../types/artifact-types.service'
import { ArtifactTypeViews } from '../types/artifact-type-views'
import { FileArtifactType } from '../types/file-artifact.type'

export function configuredArtifactPolicies(
    bindings: { source: ArtifactTypeReference; policy: IArtifactTypeProvider; url?: (slug: string) => string }[] = []
) {
    const registry = new ArtifactTypeRegistry(
        { getProviders: () => [] } as unknown as DiscoveryService,
        new Reflector()
    )
    const views = new ArtifactTypeViews()
    registry.registerBuiltin(FILE_ARTIFACT_TYPE, new FileArtifactType())
    for (const binding of bindings) {
        registry.registerBuiltin(binding.source, binding.policy)
        if (binding.url) views.register(binding.source, binding.url)
    }
    return new ArtifactTypesService(registry, views)
}
