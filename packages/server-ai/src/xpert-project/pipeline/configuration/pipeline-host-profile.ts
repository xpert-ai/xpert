import type { ProjectPipelineHostCapabilities } from '@xpert-ai/contracts'

/** This binary's implemented protocols. Never derive support from package semver or client data. */
export function pipelineHostCapabilities(): ProjectPipelineHostCapabilities {
    return {
        protocols: [1],
        features: {
            'pipeline.core': [1],
            'pipeline.provider_projection': [1],
            'pipeline.provider_actions': [1],
            'pipeline.managed': [1],
            'pipeline.assistant': [1],
            'pipeline.runtime_binding': [1],
            'pipeline.runtime_workspace': [1],
            'pipeline.resources': [1],
            'pipeline.native_model_budget': [1],
            'pipeline.provider_native_dispatch': [1]
        }
    }
}
