// Invariants: model calls never hold DB locks. Commit under the KB lock only if source and catalogue
// still match. Observations, not either projection, own durable identity assignments.
import { Injectable } from '@nestjs/common'
import { KBDocumentStatusEnum, KnowledgeIdentityDecision } from '@xpert-ai/contracts'
import { DataSource, EntityManager } from 'typeorm'
import { v5 as uuidv5 } from 'uuid'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import {
    identityFingerprint,
    identityScope,
    loadIdentityCatalogue,
    parseIdentityObservation
} from './knowledge-identity-catalogue'
import { KnowledgeIdentityEmbeddingService } from './knowledge-identity-embedding.service'
import { KnowledgeIdentityError } from './knowledge-identity-error'
import { KnowledgeIdentityObservation } from './knowledge-identity-observation.entity'
import { KnowledgeIdentity } from './knowledge-identity.entity'
import {
    KnowledgeIdentityDedupModelOutput,
    parseIdentityDecision,
    parseKnowledgeIdentityDedupOutput
} from './knowledge-identity-model'
import { canMatchIdentity, IdentityCandidate, selectIdentityCandidates } from './knowledge-identity-policy'
import {
    KnowledgeIdentityCatalogueEntry,
    KnowledgeIdentityInput,
    KnowledgeIdentityRuntime,
    KnowledgeIdentitySource
} from './knowledge-identity.types'

@Injectable()
export class KnowledgeIdentityService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly embeddings: KnowledgeIdentityEmbeddingService
    ) {}

    async assertSource(manager: EntityManager, source: KnowledgeIdentitySource) {
        const document = await manager.getRepository(KnowledgeDocument).findOne({
            where: { id: source.sourceDocumentIdSnapshot, ...identityScope(source) },
            lock: { mode: 'pessimistic_write' }
        })
        if (
            !document ||
            document.status !== KBDocumentStatusEnum.FINISH ||
            document.disabled ||
            document.deletedAt ||
            document.hardDeletePendingAt ||
            document.contentHash !== source.sourceContentHash ||
            document.publicationEpoch !== source.sourcePublicationEpoch
        ) {
            throw new KnowledgeIdentityError('stale')
        }
    }

    async resolve(source: KnowledgeIdentitySource, input: KnowledgeIdentityInput, runtime: KnowledgeIdentityRuntime) {
        return (await this.resolveBatch(source, [input], runtime))[0]
    }

    /** Resolve and publish a complete extraction together; a failed replacement leaves the previous one active. */
    async resolveBatch(
        source: KnowledgeIdentitySource,
        inputs: KnowledgeIdentityInput[],
        runtime: KnowledgeIdentityRuntime
    ): Promise<KnowledgeIdentityObservation[]> {
        if (
            !source.extractionId ||
            inputs.some((input) => !input.candidateKey || input.candidateKey.length > 512) ||
            new Set(inputs.map((input) => input.candidateKey)).size !== inputs.length
        )
            throw new KnowledgeIdentityError('invalid')
        const prepared = inputs.map((input) => {
            const payload = parseIdentityObservation(input)
            return {
                input: { ...input, ...payload },
                payload,
                sourceKey: identityFingerprint([
                    source.knowledgebaseId,
                    source.tenantId ?? null,
                    source.organizationId ?? null,
                    source.sourceDocumentIdSnapshot,
                    source.sourceContentHash,
                    source.sourcePublicationEpoch,
                    source.consumer,
                    source.extractionId,
                    input.candidateKey,
                    payload
                ])
            }
        })
        for (let attempt = 0; attempt < 3; attempt++) {
            const replay = await this.dataSource.transaction(async (manager) => {
                await this.lockSource(manager, source, runtime)
                return this.readResolved(
                    manager,
                    source,
                    prepared.map((item) => item.sourceKey)
                )
            })
            if (replay) return replay
            const catalogue = await this.catalogue(this.dataSource.manager, source)
            const working = new Map(catalogue.entries.map((entry) => [entry.id, entry]))
            const planned: Array<{
                observation: KnowledgeIdentityObservation
                created: boolean
                input: KnowledgeIdentityInput
            }> = []
            for (let ordinal = 0; ordinal < prepared.length; ordinal++) {
                const { input, payload, sourceKey } = prepared[ordinal]
                const compatible = [...working.values()].filter((entry) =>
                    canMatchIdentity(payload.descriptor, entry.profile.descriptor)
                )
                await this.embeddings.prepare(source.knowledgebaseId, input, compatible)
                const candidates = selectIdentityCandidates(
                    {
                        canonicalName: payload.canonicalName,
                        aliases: payload.aliases,
                        descriptor: payload.descriptor,
                        embedding: input.embedding.vector
                    },
                    compatible.map((entry) => ({
                        id: entry.id,
                        canonicalName: entry.canonicalName,
                        aliases: entry.profile.aliases,
                        descriptor: entry.profile.descriptor,
                        embedding: entry.profile.embedding.vector
                    }))
                )
                const judgment = await this.judge(input, sourceKey, candidates, runtime, ordinal)
                const identityId =
                    judgment.identityId ??
                    uuidv5(`knowledge-identity:${source.knowledgebaseId}:${sourceKey}`, uuidv5.URL)
                const decision: KnowledgeIdentityDecision = {
                    outcome: judgment.decision === 'different' ? 'new' : judgment.decision,
                    reason: judgment.reason,
                    comparedIdentityIds: candidates.map((candidate) => candidate.id)
                }
                planned.push({
                    observation: Object.assign(new KnowledgeIdentityObservation(), source, {
                        candidateKey: input.candidateKey,
                        sourceKey,
                        identityId,
                        payload,
                        decision,
                        isCurrent: true
                    }),
                    created: !judgment.identityId,
                    input
                })
                this.addCandidate(working, identityId, input)
            }
            const result = await this.dataSource.transaction(async (manager) => {
                await this.lockSource(manager, source, runtime)
                const replay = await this.readResolved(
                    manager,
                    source,
                    prepared.map((item) => item.sourceKey)
                )
                if (replay) return replay
                const latest = await this.catalogue(manager, source, true)
                if (latest.fingerprint !== catalogue.fingerprint) return null
                const identities = manager.getRepository(KnowledgeIdentity)
                const observations = manager.getRepository(KnowledgeIdentityObservation)
                for (const { observation, created, input } of planned) {
                    if (created) {
                        await identities.save(
                            identities.create({
                                ...identityScope(source),
                                tenantId: source.tenantId,
                                organizationId: source.organizationId,
                                id: observation.identityId,
                                kind: input.descriptor.kind,
                                revision: 1,
                                embedding: input.embedding
                            })
                        )
                    } else {
                        await identities.increment(
                            { id: observation.identityId, ...identityScope(source) },
                            'revision',
                            1
                        )
                    }
                }
                await observations.update(
                    {
                        ...identityScope(source),
                        sourceDocumentIdSnapshot: source.sourceDocumentIdSnapshot,
                        consumer: source.consumer,
                        isCurrent: true
                    },
                    { isCurrent: false }
                )
                return planned.length ? observations.save(planned.map((item) => item.observation)) : []
            })
            if (result !== null) return result
        }
        throw new KnowledgeIdentityError('busy')
    }

    private async readResolved(manager: EntityManager, source: KnowledgeIdentitySource, keys: string[]) {
        const rows = await manager.getRepository(KnowledgeIdentityObservation).find({
            where: {
                ...identityScope(source),
                sourceDocumentIdSnapshot: source.sourceDocumentIdSnapshot,
                consumer: source.consumer,
                extractionId: source.extractionId
            }
        })
        if (!rows.length) return null
        if (rows.some((row) => !row.isCurrent)) throw new KnowledgeIdentityError('stale')
        const byKey = new Map(rows.map((row) => [row.sourceKey, row]))
        if (rows.length !== keys.length || keys.some((key) => !byKey.has(key)))
            throw new KnowledgeIdentityError('invalid')
        return keys.map((key) => {
            const row = byKey.get(key)
            row.payload = parseIdentityObservation(row.payload)
            row.decision = parseIdentityDecision(row.decision)
            return row
        })
    }

    private async catalogue(manager: EntityManager, source: KnowledgeIdentitySource, lockSources = false) {
        const catalogues: Array<Awaited<ReturnType<typeof loadIdentityCatalogue>>> = []
        for (const kind of ['entity', 'concept'] as const) {
            catalogues.push(
                await loadIdentityCatalogue(manager, source, kind, {
                    sourceDocumentId: source.sourceDocumentIdSnapshot,
                    lockSources
                })
            )
        }
        return {
            entries: catalogues.flatMap((item) => item.entries),
            fingerprint: identityFingerprint(catalogues.map((item) => item.fingerprint))
        }
    }

    private addCandidate(
        entries: Map<string, KnowledgeIdentityCatalogueEntry>,
        id: string,
        input: KnowledgeIdentityInput
    ) {
        const entry = entries.get(id)
        if (!entry) {
            entries.set(id, {
                id,
                revision: 0,
                canonicalName: input.canonicalName,
                profile: {
                    descriptor: structuredClone(input.descriptor),
                    aliases: [...new Set([input.canonicalName, ...input.aliases])],
                    embedding: input.embedding
                }
            })
            return
        }
        entry.profile.aliases = [...new Set([...entry.profile.aliases, input.canonicalName, ...input.aliases])]
        const descriptor = entry.profile.descriptor
        if (descriptor.kind === 'entity' && input.descriptor.kind === 'entity') {
            descriptor.identifiers = [
                ...new Map(
                    [...descriptor.identifiers, ...input.descriptor.identifiers].map((item) => [item.namespace, item])
                ).values()
            ]
            if (descriptor.entityType === 'unknown') descriptor.entityType = input.descriptor.entityType
        }
    }

    private async lockSource(
        manager: EntityManager,
        source: KnowledgeIdentitySource,
        runtime: KnowledgeIdentityRuntime
    ) {
        const kb = await manager.getRepository(Knowledgebase).findOne({
            where: { id: source.knowledgebaseId, tenantId: source.tenantId, organizationId: source.organizationId },
            lock: { mode: 'pessimistic_write' }
        })
        if (!kb) throw new KnowledgeIdentityError('stale')
        await this.assertSource(manager, source)
        await runtime.assertCurrent(manager)
    }

    private async judge(
        input: KnowledgeIdentityInput,
        candidateId: string,
        candidates: IdentityCandidate[],
        runtime: KnowledgeIdentityRuntime,
        ordinal: number
    ): Promise<KnowledgeIdentityDedupModelOutput> {
        const answers: KnowledgeIdentityDedupModelOutput[] = []
        for (let offset = 0; offset < candidates.length; offset += 8) {
            const batch = candidates.slice(offset, offset + 8)
            const request = {
                canonicalName: input.canonicalName,
                aliases: input.aliases,
                descriptor: input.descriptor,
                facts: input.facts,
                candidateId,
                candidates: batch.map((candidate) => ({
                    id: candidate.id,
                    canonicalName: candidate.canonicalName,
                    aliases: candidate.aliases,
                    descriptor: candidate.descriptor
                }))
            }
            answers.push(parseKnowledgeIdentityDedupOutput(await runtime.judge(request, ordinal), request))
        }
        const matches = answers.filter((answer) => answer.decision === 'same')
        if (matches.length === 1 && answers.every((answer) => answer.decision !== 'uncertain')) return matches[0]
        if (matches.length > 1 || answers.some((answer) => answer.decision === 'uncertain')) {
            return {
                decision: 'uncertain',
                identityId: null,
                reason: 'The supplied evidence does not identify exactly one compatible canonical entry.'
            }
        }
        return {
            decision: 'different',
            identityId: null,
            reason: answers.length
                ? answers.map((answer) => answer.reason).join('\n')
                : 'No compatible identity candidates exist in this knowledgebase.'
        }
    }
}
