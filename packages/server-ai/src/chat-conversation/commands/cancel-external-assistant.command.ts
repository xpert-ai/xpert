import type { IXpertAgentExecution } from '@xpert-ai/contracts'

/** The caller must authorize contribution to this execution's thread. */
export class CancelExternalAssistantCommand {
    constructor(readonly execution: IXpertAgentExecution) {}
}
