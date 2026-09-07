import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import type { Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase.service'
import {
    KnowledgeWikiJob,
    KnowledgeWikiModelInvocation,
    KnowledgeWikiPage,
    KnowledgeWikiPageEvidenceEntity,
    KnowledgeWikiPageLinkEntity,
    KnowledgeWikiPageVersion,
    KnowledgeWikiSourceState
} from './entities'
import { KnowledgeWikiService } from './knowledge-wiki.service'

function createService(params: {
    knowledgebase: Partial<Knowledgebase>
    canWrite: boolean
    readyPageCount?: number
    pageRepository?: { findAndCount?: jest.Mock; findOne?: jest.Mock }
    pageVersionRepository?: { find?: jest.Mock; findOne?: jest.Mock }
    evidenceRepository?: { find?: jest.Mock }
    linkRepository?: { find?: jest.Mock }
    sourceStateRepository?: { count?: jest.Mock; find?: jest.Mock }
    invocations?: KnowledgeWikiModelInvocation[]
}) {
    const knowledgebase = {
        wikiConfig: { enabled: true, extractionGranularity: 'standard' as const },
        ...params.knowledgebase
    }
    const knowledgebaseService = {
        findOneByIdString: jest.fn().mockResolvedValue(knowledgebase),
        canManageKnowledgebase: jest.fn().mockResolvedValue(params.canWrite),
        assertKnowledgebaseWriteAccess: params.canWrite
            ? jest.fn().mockResolvedValue(params.knowledgebase)
            : jest.fn().mockRejectedValue(new ForbiddenException())
    }
    const pageRepository = {
        count: jest
            .fn()
            .mockResolvedValueOnce(params.readyPageCount ?? 0)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(0),
        ...params.pageRepository
    }
    const jobRepository = {
        count: jest.fn().mockResolvedValue(0)
    }
    const invocationRepository = {
        count: jest.fn().mockResolvedValue(0),
        find: jest.fn().mockResolvedValue(params.invocations ?? [])
    }
    const sourceStateRepository = {
        count: jest.fn().mockResolvedValue(0),
        ...params.sourceStateRepository
    }

    const service = new KnowledgeWikiService(
        knowledgebaseService as unknown as KnowledgebaseService,
        pageRepository as unknown as Repository<KnowledgeWikiPage>,
        (params.pageVersionRepository ?? {}) as unknown as Repository<KnowledgeWikiPageVersion>,
        (params.evidenceRepository ?? {}) as unknown as Repository<KnowledgeWikiPageEvidenceEntity>,
        (params.linkRepository ?? {}) as unknown as Repository<KnowledgeWikiPageLinkEntity>,
        jobRepository as unknown as Repository<KnowledgeWikiJob>,
        invocationRepository as unknown as Repository<KnowledgeWikiModelInvocation>,
        sourceStateRepository as unknown as Repository<KnowledgeWikiSourceState>
    )

    return { service, knowledgebaseService, pageRepository }
}

describe('KnowledgeWikiService', () => {
    it('offers a retry without an additional-charge warning for calls that were never executed', async () => {
        const { service } = createService({
            knowledgebase: { id: 'kb-1', type: KnowledgebaseTypeEnum.Standard, wikiStatus: 'failed' },
            canWrite: true,
            invocations: [
                Object.assign(new KnowledgeWikiModelInvocation(), {
                    id: 'invocation-1',
                    jobId: 'job-1',
                    status: 'failed',
                    reconciliationStatus: 'not_executed',
                    job: { isCurrent: true, status: 'failed' }
                })
            ]
        })

        await expect(service.getStatus('kb-1')).resolves.toMatchObject({
            recoveryActions: [
                {
                    invocationId: 'invocation-1',
                    jobId: 'job-1',
                    reconciliationStatus: 'not_executed',
                    canRetry: true,
                    inputCurrent: true,
                    requiresAdditionalChargeConfirmation: false,
                    recommendedAction: 'retry_job'
                }
            ]
        })
    })

    it('returns only reader-safe status fields without write access', async () => {
        const { service } = createService({
            knowledgebase: {
                id: 'kb-1',
                type: KnowledgebaseTypeEnum.Standard,
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                wikiConfig: { enabled: true, extractionGranularity: 'standard' },
                wikiStatus: 'failed',
                wikiAvailability: 'degraded',
                wikiBuildError: 'provider payload contained a secret'
            },
            canWrite: false,
            readyPageCount: 4
        })

        const status = await service.getStatus('kb-1')

        expect(status).toEqual({
            canManage: false,
            enabled: true,
            status: 'failed',
            availability: 'degraded',
            readyPageCount: 4,
            requiresManagement: true,
            errorCode: 'knowledge_wiki_attention_required'
        })
        expect(status).not.toHaveProperty('activeRevision')
        expect(status).not.toHaveProperty('recoveryActions')
        expect(status).not.toHaveProperty('wikiBuildError')
    })

    it('returns management counters and revisions only with write access', async () => {
        const { service } = createService({
            knowledgebase: {
                id: 'kb-1',
                type: KnowledgebaseTypeEnum.Standard,
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                wikiConfig: { enabled: true, extractionGranularity: 'standard' },
                wikiStatus: 'ready',
                wikiAvailability: 'ready',
                wikiActiveRevision: 3,
                wikiStagedRevision: null,
                wikiConfigFingerprint: 'fingerprint-1'
            },
            canWrite: true,
            readyPageCount: 4
        })

        const status = await service.getStatus('kb-1')

        expect(status).toMatchObject({
            canManage: true,
            enabled: true,
            status: 'ready',
            availability: 'ready',
            readyPageCount: 4,
            activeRevision: 3,
            stagedRevision: null,
            activeConfigFingerprint: 'fingerprint-1',
            generationJobs: { queued: 0, running: 0, failed: 0 },
            pages: { ready: 4, stale: 0, failed: 0, archived: 0, projectionFailed: 0 },
            recoveryActions: []
        })
    })

    it('rejects Wiki APIs for non-standard knowledgebases', async () => {
        const { service } = createService({
            knowledgebase: {
                id: 'kb-faq',
                type: KnowledgebaseTypeEnum.FAQ,
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            },
            canWrite: true
        })

        await expect(service.getStatus('kb-faq')).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('allows reading enabled Wiki status without a separate organization feature grant', async () => {
        const { service } = createService({
            knowledgebase: {
                id: 'kb-1',
                type: KnowledgebaseTypeEnum.Standard,
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            },
            canWrite: false
        })

        await expect(service.getStatus('kb-1')).resolves.toMatchObject({ enabled: true, canManage: false })
    })

    it('still requires knowledgebase read access for Wiki status and pages', async () => {
        const { service, knowledgebaseService, pageRepository } = createService({
            knowledgebase: { id: 'kb-1', type: KnowledgebaseTypeEnum.Standard },
            canWrite: false,
            pageRepository: { findAndCount: jest.fn(), findOne: jest.fn() }
        })
        knowledgebaseService.findOneByIdString.mockRejectedValue(new ForbiddenException())

        await expect(service.getStatus('kb-1')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.listPages('kb-1')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.getPage('kb-1', 'page-1')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(service.getDocumentStatus('kb-1', ['doc-1'])).rejects.toBeInstanceOf(ForbiddenException)
        expect(pageRepository.count).not.toHaveBeenCalled()
        expect(pageRepository.findAndCount).not.toHaveBeenCalled()
        expect(pageRepository.findOne).not.toHaveBeenCalled()
    })

    it('does not expose Wiki pages when the knowledgebase has not enabled Wiki', async () => {
        const { service, pageRepository } = createService({
            knowledgebase: {
                id: 'kb-1',
                type: KnowledgebaseTypeEnum.Standard,
                wikiConfig: { enabled: false, extractionGranularity: 'standard' }
            },
            canWrite: true,
            pageRepository: { findAndCount: jest.fn(), findOne: jest.fn() }
        })

        await expect(service.getStatus('kb-1')).resolves.toMatchObject({ enabled: false })
        await expect(service.listPages('kb-1')).rejects.toBeInstanceOf(NotFoundException)
        await expect(service.getPage('kb-1', 'page-1')).rejects.toBeInstanceOf(NotFoundException)
        expect(pageRepository.findAndCount).not.toHaveBeenCalled()
        expect(pageRepository.findOne).not.toHaveBeenCalled()
    })

    it('does not let readers query diagnostic page states', async () => {
        const { service } = createService({
            knowledgebase: {
                id: 'kb-1',
                type: KnowledgebaseTypeEnum.Standard,
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            },
            canWrite: false
        })

        await expect(service.listPages('kb-1', { status: 'failed' })).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('returns only active ready page versions to readers', async () => {
        const page = Object.assign(new KnowledgeWikiPage(), {
            id: 'page-1',
            knowledgebaseId: 'kb-1',
            pageKey: 'concept:retrieval',
            pageType: 'concept' as const,
            canonicalName: 'Retrieval',
            slug: 'retrieval-a1b2',
            status: 'ready' as const,
            projectionStatus: 'ready' as const,
            activeVersionId: 'version-1',
            updatedAt: new Date('2026-09-05T08:00:00.000Z')
        })
        const version = Object.assign(new KnowledgeWikiPageVersion(), {
            id: 'version-1',
            pageId: 'page-1',
            title: 'Retrieval',
            summary: 'How retrieval works.',
            aliases: ['Search']
        })
        const findAndCount = jest.fn().mockResolvedValue([[page], 1])
        const find = jest.fn().mockResolvedValue([version])
        const { service } = createService({
            knowledgebase: {
                id: 'kb-1',
                type: KnowledgebaseTypeEnum.Standard,
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            },
            canWrite: false,
            pageRepository: { findAndCount },
            pageVersionRepository: { find }
        })

        await expect(service.listPages('kb-1')).resolves.toEqual({
            items: [
                {
                    id: 'page-1',
                    pageKey: 'concept:retrieval',
                    pageType: 'concept',
                    canonicalName: 'Retrieval',
                    title: 'Retrieval',
                    slug: 'retrieval-a1b2',
                    summary: 'How retrieval works.',
                    aliases: ['Search'],
                    status: 'ready',
                    projectionStatus: 'ready',
                    updatedAt: new Date('2026-09-05T08:00:00.000Z')
                }
            ],
            total: 1
        })
        expect(findAndCount).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    tenantId: 'tenant-1',
                    organizationId: 'org-1',
                    knowledgebaseId: 'kb-1',
                    status: 'ready'
                })
            })
        )
    })

    it('hides non-ready page content from readers', async () => {
        const page = Object.assign(new KnowledgeWikiPage(), {
            id: 'page-1',
            knowledgebaseId: 'kb-1',
            pageKey: 'concept:retrieval',
            pageType: 'concept' as const,
            canonicalName: 'Retrieval',
            slug: 'retrieval-a1b2',
            status: 'stale' as const,
            projectionStatus: 'disabled' as const,
            activeVersionId: 'version-1'
        })
        const { service } = createService({
            knowledgebase: {
                id: 'kb-1',
                type: KnowledgebaseTypeEnum.Standard,
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            },
            canWrite: false,
            pageRepository: { findOne: jest.fn().mockResolvedValue(page) }
        })

        await expect(service.getPage('kb-1', 'page-1')).rejects.toBeInstanceOf(NotFoundException)
    })

    it('returns active page content and only evidence from eligible source states', async () => {
        const page = Object.assign(new KnowledgeWikiPage(), {
            id: 'page-1',
            knowledgebaseId: 'kb-1',
            pageKey: 'concept:retrieval',
            pageType: 'concept' as const,
            canonicalName: 'Retrieval',
            slug: 'retrieval-a1b2',
            status: 'ready' as const,
            projectionStatus: 'ready' as const,
            activeVersionId: 'version-1',
            updatedAt: new Date('2026-09-05T08:00:00.000Z')
        })
        const version = Object.assign(new KnowledgeWikiPageVersion(), {
            id: 'version-1',
            pageId: 'page-1',
            title: 'Retrieval',
            summary: 'How retrieval works.',
            aliases: ['Search'],
            contentMarkdown: '# Retrieval',
            generationRevision: 3,
            status: 'ready' as const,
            projectionStatus: 'ready' as const
        })
        const evidence = Object.assign(new KnowledgeWikiPageEvidenceEntity(), {
            id: 'evidence-1',
            pageVersionId: 'version-1',
            sourceDocumentIdSnapshot: 'document-1',
            sourceChunkIdSnapshot: 'chunk-1',
            quote: 'Retrieval combines candidates.',
            ordinal: 0,
            sectionAnchor: 'overview'
        })
        const { service } = createService({
            knowledgebase: {
                id: 'kb-1',
                type: KnowledgebaseTypeEnum.Standard,
                tenantId: 'tenant-1',
                organizationId: 'org-1'
            },
            canWrite: false,
            pageRepository: { findOne: jest.fn().mockResolvedValue(page) },
            pageVersionRepository: { findOne: jest.fn().mockResolvedValue(version) },
            evidenceRepository: { find: jest.fn().mockResolvedValue([evidence]) },
            linkRepository: { find: jest.fn().mockResolvedValue([]) },
            sourceStateRepository: {
                find: jest.fn().mockResolvedValue([
                    Object.assign(new KnowledgeWikiSourceState(), {
                        sourceDocumentIdSnapshot: 'document-1',
                        eligible: true
                    })
                ])
            }
        })

        await expect(service.getPage('kb-1', 'page-1')).resolves.toMatchObject({
            id: 'page-1',
            title: 'Retrieval',
            markdown: '# Retrieval',
            revision: 3,
            evidence: [
                {
                    id: 'evidence-1',
                    sourceDocumentId: 'document-1',
                    sourceChunkId: 'chunk-1',
                    quote: 'Retrieval combines candidates.',
                    ordinal: 0,
                    sectionAnchor: 'overview',
                    sourceAvailable: true
                }
            ]
        })
    })
})
