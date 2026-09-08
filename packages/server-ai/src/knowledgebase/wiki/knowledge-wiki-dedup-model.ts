import { KnowledgeWikiIdentityDescriptor } from '@xpert-ai/contracts'
import { z } from 'zod'
import { createIdentityDescriptorOptions, parseKnowledgeIdentityDescriptor } from '../identity/knowledge-identity-model'

export const knowledgeWikiIdentityDescriptorSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('summary') }),
    ...createIdentityDescriptorOptions()
])

export function parseWikiIdentityDescriptor(value: unknown): KnowledgeWikiIdentityDescriptor {
    const descriptor = knowledgeWikiIdentityDescriptorSchema.parse(value)
    return descriptor.kind === 'summary' ? { kind: 'summary' } : parseKnowledgeIdentityDescriptor(descriptor)
}

export {
    knowledgeIdentityDedupOutputSchema as knowledgeWikiDedupOutputSchema,
    KnowledgeIdentityDedupModelInput as KnowledgeWikiDedupModelInput,
    KnowledgeIdentityDedupModelOutput as KnowledgeWikiDedupModelOutput,
    parseKnowledgeIdentityDedupOutput as parseKnowledgeWikiDedupOutput,
    buildKnowledgeIdentityDedupMessages as buildKnowledgeWikiDedupMessages
} from '../identity/knowledge-identity-model'
