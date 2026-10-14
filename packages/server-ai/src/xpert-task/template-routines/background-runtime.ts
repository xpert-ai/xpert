import { IXpert, templateManifestSchema } from '@xpert-ai/contracts'
import { t } from 'i18next'

class LocalRuntimeUnavailable extends Error {
    readonly code = 'LOCAL_RUNTIME_UNAVAILABLE'
    constructor() {
        super(t('server-ai:Error.TemplateRoutineLocalUnavailable'))
    }
}

export function assertBackgroundRuntime(assistant: IXpert) {
    const declared = assistant.options?.templateDefinition?.manifest ?? assistant.options?.templateSource?.manifest
    const execution = declared ? templateManifestSchema.parse(declared).execution : undefined
    if (execution?.offline === 'local-only' || execution?.localCapabilities?.length) throw new LocalRuntimeUnavailable()
}
