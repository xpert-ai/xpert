// A publication hash can repeat after A -> B -> A. Advance its epoch in the same SQL update.
// Progress-only updates and unchanged processing must not invalidate already published derived work.
import { IKnowledgeDocument, KnowledgeDocumentMetadata } from '@xpert-ai/contracts'

type DocumentPatch = Partial<IKnowledgeDocument<KnowledgeDocumentMetadata>>
type PublicationPatch = Omit<DocumentPatch, 'publicationEpoch'> & { publicationEpoch?: () => string }

/** Keep TypeORM's recursive entity types outside orchestration callers. */
export type KnowledgeDocumentPublicationWriter = {
    update(documentId: string, updates: PublicationPatch): Promise<unknown>
    findOne(
        documentId: string,
        options: { select: { id: true; metadata: true } }
    ): Promise<Pick<IKnowledgeDocument, 'metadata'>>
}

export function writeKnowledgeDocumentPublication(
    writer: Pick<KnowledgeDocumentPublicationWriter, 'update'>,
    documentId: string,
    updates: DocumentPatch,
    contentChanged: boolean
) {
    const { publicationEpoch: _publicationEpoch, ...patch } = updates
    return writer.update(documentId, {
        ...patch,
        ...(contentChanged ? { publicationEpoch: () => 'COALESCE("publicationEpoch", 0) + 1' } : {})
    })
}

export async function writeKnowledgeDocumentProcessingMetadata(
    writer: KnowledgeDocumentPublicationWriter,
    documentId: string,
    updates: DocumentPatch,
    metadataPatch?: Partial<KnowledgeDocumentMetadata>,
    contentChanged?: boolean
) {
    const { publicationEpoch: _publicationEpoch, ...patch } = updates
    if (metadataPatch) {
        const current = await writer.findOne(documentId, { select: { id: true, metadata: true } })
        patch.metadata = { ...(current.metadata ?? {}), ...metadataPatch }
    }
    if (contentChanged !== undefined) {
        return writeKnowledgeDocumentPublication(writer, documentId, patch, contentChanged)
    }
    return writer.update(documentId, patch)
}
