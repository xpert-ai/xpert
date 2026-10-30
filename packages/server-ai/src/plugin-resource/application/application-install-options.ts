import type { TCopilotModel } from '@xpert-ai/contracts'

/** Trusted server inputs, separate from HTTP initialization DTOs and authorization. */
export interface ApplicationInstallOptions {
    primaryModel?: TCopilotModel
    knowledgebaseBindings?: ReadonlyMap<string, string>
    toolsetSourceIds?: readonly string[]
}
