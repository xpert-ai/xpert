import {
    KBDocumentStatusEnum,
    KnowledgeIdentityDescriptor,
    KnowledgeIdentityObservationPayload
} from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { EntityManager, IsNull } from 'typeorm'
import { z } from 'zod'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { KnowledgeIdentityError } from './knowledge-identity-error'
import { KnowledgeIdentityObservation } from './knowledge-identity-observation.entity'
import { knowledgeIdentityDescriptorSchema, parseKnowledgeIdentityDescriptor } from './knowledge-identity-model'
import { canMatchIdentity } from './knowledge-identity-policy'
import { KnowledgeIdentityCatalogueEntry, KnowledgeIdentitySource } from './knowledge-identity.types'

export const identityFingerprint = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

const observationSchema = z.object({
    canonicalName: z.string().trim().min(1).max(512),
    descriptor: knowledgeIdentityDescriptorSchema,
    aliases: z.array(z.string().trim().min(1).max(512)),
    facts: z.array(z.object({ text: z.string(), sourceChunkIds: z.array(z.string()) }))
})

export function parseIdentityObservation(value: unknown): KnowledgeIdentityObservationPayload {
    const payload = observationSchema.parse(value) as KnowledgeIdentityObservationPayload
    payload.descriptor = parseKnowledgeIdentityDescriptor(payload.descriptor)
    return payload
}

export function identityScope(
    source: Pick<KnowledgeIdentitySource, 'knowledgebaseId' | 'tenantId' | 'organizationId'>
) {
    return {
        knowledgebaseId: source.knowledgebaseId,
        tenantId: source.tenantId ?? IsNull(),
        organizationId: source.organizationId ?? IsNull()
    }
}

export async function loadIdentityCatalogue(
    manager: EntityManager,
    source: Pick<KnowledgeIdentitySource, 'knowledgebaseId' | 'tenantId' | 'organizationId'>,
    kind: KnowledgeIdentityDescriptor['kind'],
    options: { sourceDocumentId?: string; lockSources?: boolean } = {}
) {
    const query = manager
        .getRepository(KnowledgeIdentityObservation)
        .createQueryBuilder('observation')
        .innerJoinAndSelect('observation.identity', 'identity')
        .innerJoinAndMapOne(
            'observation.sourceDocument',
            KnowledgeDocument,
            'document',
            [
                'document.id = observation.sourceDocumentIdSnapshot',
                'document.knowledgebaseId = observation.knowledgebaseId',
                'document.tenantId IS NOT DISTINCT FROM observation.tenantId',
                'document.organizationId IS NOT DISTINCT FROM observation.organizationId'
            ].join(' AND ')
        )
        .where(identityScope(source))
        .andWhere('observation.isCurrent = TRUE')
        .andWhere('identity.kind = :kind', { kind })
        .andWhere(
            options.sourceDocumentId
                ? '((document.contentHash = observation.sourceContentHash AND document.publicationEpoch = observation.sourcePublicationEpoch) OR (document.id = :lineageDocumentId AND observation.sourcePublicationEpoch < document.publicationEpoch))'
                : '(document.contentHash = observation.sourceContentHash AND document.publicationEpoch = observation.sourcePublicationEpoch)',
            { lineageDocumentId: options.sourceDocumentId }
        )
        .andWhere('document.status = :status', { status: KBDocumentStatusEnum.FINISH })
        .andWhere('document.disabled IS NOT TRUE')
        .andWhere('document.deletedAt IS NULL AND document.hardDeletePendingAt IS NULL')
        .orderBy('observation.sourcePublicationEpoch', 'DESC')
        .addOrderBy('observation.createdAt', 'ASC')
        .addOrderBy('observation.id', 'ASC')
    if (options.lockSources) query.setLock('pessimistic_read', undefined, ['document'])
    const rows = await query.getMany()
    const isCurrent = (row: KnowledgeIdentityObservation) =>
        row.sourceDocument.contentHash === row.sourceContentHash &&
        row.sourceDocument.publicationEpoch === row.sourcePublicationEpoch
    const activeIdentities = new Set(rows.filter(isCurrent).map((row) => row.identityId))
    const historicalIdentities = new Set<string>()
    const observations = rows.filter((row) => {
        if (isCurrent(row)) return true
        // Same-document lineage can preserve a stable identity through reprocessing. Never use it
        // as current evidence, or let withdrawn aliases override an identity's remaining live sources.
        if (activeIdentities.has(row.identityId) || historicalIdentities.has(row.identityId)) return false
        historicalIdentities.add(row.identityId)
        return true
    })
    const entries = new Map<string, KnowledgeIdentityCatalogueEntry>()
    for (const observation of observations) {
        const payload = parseIdentityObservation(observation.payload)
        if (payload.descriptor.kind !== kind) throw new KnowledgeIdentityError('invalid')
        const current = entries.get(observation.identityId)
        if (!current) {
            entries.set(observation.identityId, {
                id: observation.identityId,
                revision: observation.identity.revision,
                canonicalName: payload.canonicalName,
                profile: {
                    descriptor: payload.descriptor,
                    aliases: [...new Set([payload.canonicalName, ...payload.aliases])],
                    embedding: observation.identity.embedding
                }
            })
        } else {
            if (!canMatchIdentity(current.profile.descriptor, payload.descriptor))
                throw new KnowledgeIdentityError('invalid')
            current.profile.aliases = [
                ...new Set([...current.profile.aliases, payload.canonicalName, ...payload.aliases])
            ]
            if (current.profile.descriptor.kind === 'entity' && payload.descriptor.kind === 'entity') {
                const descriptor = current.profile.descriptor
                descriptor.identifiers = [
                    ...new Map(
                        [...descriptor.identifiers, ...payload.descriptor.identifiers].map((item) => [
                            item.namespace,
                            item
                        ])
                    ).values()
                ]
                if (descriptor.entityType === 'unknown') descriptor.entityType = payload.descriptor.entityType
            }
        }
    }
    return {
        entries: [...entries.values()],
        fingerprint: identityFingerprint(
            observations.map((observation) => [observation.id, observation.identityId, observation.identity.revision])
        )
    }
}
