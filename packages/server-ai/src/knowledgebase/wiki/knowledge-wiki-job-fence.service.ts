import { KBDocumentStatusEnum, normalizeKnowledgebaseWikiConfig } from '@xpert-ai/contracts'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { t } from 'i18next'
import { Equal, IsNull, Or, Repository } from 'typeorm'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob } from './entities'
import { createKnowledgeWikiConfigFingerprint, resolveKnowledgeWikiModel } from './knowledge-wiki-config'
import { isEligibleKnowledgeWikiSource } from './knowledge-wiki-generation.utils'

@Injectable()
export class KnowledgeWikiJobFenceService {
    constructor(
        @InjectRepository(Knowledgebase)
        private readonly knowledgebaseRepository: Repository<Knowledgebase>,
        @InjectRepository(KnowledgeDocument)
        private readonly documentRepository: Repository<KnowledgeDocument>,
        @InjectRepository(KnowledgeWikiJob)
        private readonly jobRepository: Repository<KnowledgeWikiJob>
    ) {}

    async assert(job: KnowledgeWikiJob, requireActiveFingerprint = true) {
        const knowledgebase = await this.loadKnowledgebase(job.knowledgebaseId)
        const config = normalizeKnowledgebaseWikiConfig(knowledgebase.wikiConfig)
        const targetFingerprint = createKnowledgeWikiConfigFingerprint(config, resolveKnowledgeWikiModel(knowledgebase))
        const revisionMatches =
            knowledgebase.wikiActiveRevision === job.generationRevision ||
            knowledgebase.wikiStagedRevision === job.generationRevision ||
            knowledgebase.wikiRevision === job.generationRevision
        if (!config.enabled || targetFingerprint !== job.configFingerprint || !revisionMatches) {
            await this.markStale(job)
            throw new Error(
                t('server-ai:Error.KnowledgebaseWikiJobStale', {
                    defaultValue: 'The Wiki job is stale for the current revision or configuration'
                })
            )
        }
        if (
            requireActiveFingerprint &&
            !knowledgebase.wikiStagedRevision &&
            knowledgebase.wikiConfigFingerprint !== job.configFingerprint
        ) {
            await this.markStale(job)
            throw new Error(
                t('server-ai:Error.KnowledgebaseWikiFingerprintStale', {
                    defaultValue: 'The Wiki job configuration fingerprint is no longer active'
                })
            )
        }
        return knowledgebase
    }

    async loadKnowledgebase(knowledgebaseId: string) {
        const knowledgebase = await this.knowledgebaseRepository.findOne({
            where: { id: knowledgebaseId },
            relations: ['wikiModel', 'chatModel']
        })
        if (!knowledgebase) {
            throw new NotFoundException(
                t('server-ai:Error.KnowledgebaseAccessDenied', { defaultValue: 'Knowledgebase was not found' })
            )
        }
        return knowledgebase
    }

    async findEligibleDocuments(knowledgebaseId: string) {
        const documents = await this.documentRepository.find({
            where: {
                knowledgebaseId,
                status: KBDocumentStatusEnum.FINISH,
                disabled: Or(IsNull(), Equal(false)),
                deletedAt: IsNull(),
                hardDeletePendingAt: IsNull()
            }
        })
        return documents.filter(isEligibleKnowledgeWikiSource)
    }

    isSourceCurrent(job: KnowledgeWikiJob, document: KnowledgeDocument) {
        return (
            document.contentHash === job.sourceContentHash &&
            (document.publicationEpoch ?? 0) === (job.sourcePublicationEpoch ?? 0)
        )
    }

    private markStale(job: KnowledgeWikiJob) {
        return this.jobRepository.update(job.id, { status: 'stale', isCurrent: false, completedAt: new Date() })
    }
}
