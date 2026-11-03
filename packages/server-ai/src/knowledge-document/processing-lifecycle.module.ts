// Compatibility aliases keep existing worker injection tokens on the shared CQRS bootstrap gate.
export {
    ExecutionContextReadyService as KnowledgeProcessingReadyService,
    ExecutionContextLifecycleModule as KnowledgeProcessingLifecycleModule
} from '@xpert-ai/server-core'
