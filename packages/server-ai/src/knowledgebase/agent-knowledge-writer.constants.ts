import { createHash } from 'node:crypto'

export const KNOWLEDGEBASE_WRITER_MIDDLEWARE = 'knowledgebase-writer'

export const WRITE_KNOWLEDGE_CHUNK_TOOL = 'write_knowledge_chunk'

export const AGENT_WRITER_SYSTEM_MANAGED_TYPE = 'agent-writer'

export function getAgentWriterDocumentName(agentKey: string) {
    return `__agent__:${agentKey}`
}

export function getAgentWriterDocumentPath(agentKey: string) {
    return `__system__/agents/${agentKey}.txt`
}

export function getAgentWriterManagedDocumentPath(agentKey: string, documentKey: string) {
    const digest = createHash('sha256').update(documentKey).digest('hex').slice(0, 24)
    return `__system__/agents/${agentKey}/${digest}.txt`
}
