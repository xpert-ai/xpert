import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import {
    isDocumentKnowledgebaseType,
    normalizeKnowledgebaseWikiConfig,
    KnowledgeWikiFolderInput
} from '@xpert-ai/contracts'
import { t } from 'i18next'
import { KnowledgebaseService } from '../knowledgebase.service'
import { Knowledgebase } from '../knowledgebase.entity'
import {
    KnowledgeWikiFolder,
    KnowledgeWikiPlacement,
    KnowledgeWikiTaxonomy
} from './entities/knowledge-wiki-organization.entity'
import { KnowledgeWikiPage } from './entities/knowledge-wiki-page.entity'
import { validateWikiFolderMove, wikiOrganizationError } from './knowledge-wiki-organization.utils'

@Injectable()
export class KnowledgeWikiOrganizationService {
    constructor(
        private readonly knowledgebases: KnowledgebaseService,
        readonly dataSource: DataSource
    ) {}

    async authorize(id: string, write = false) {
        const kb = write
            ? await this.knowledgebases.assertKnowledgebaseWriteAccess(id, { relations: ['wikiModel', 'chatModel'] })
            : await this.knowledgebases.findOneByIdString(id, { relations: ['wikiModel', 'chatModel'] })
        if (!isDocumentKnowledgebaseType(kb.type) || !normalizeKnowledgebaseWikiConfig(kb.wikiConfig).enabled) {
            throw new NotFoundException(
                t('server-ai:Error.KnowledgebaseWikiPageNotFound', { defaultValue: 'Wiki page was not found' })
            )
        }
        return kb
    }

    async lock(manager: EntityManager, id: string) {
        return manager
            .getRepository(Knowledgebase)
            .findOneOrFail({ where: { id }, lock: { mode: 'pessimistic_write' } })
    }

    async taxonomy(manager: EntityManager, kb: Knowledgebase) {
        const repo = manager.getRepository(KnowledgeWikiTaxonomy)
        return (
            (await repo.findOneBy({ knowledgebaseId: kb.id })) ??
            repo.create({
                knowledgebaseId: kb.id,
                tenantId: kb.tenantId,
                organizationId: kb.organizationId,
                enabled: false,
                revision: 0
            })
        )
    }

    async configure(id: string, enabled: boolean, revision: number) {
        await this.authorize(id, true)
        return this.dataSource.transaction(async (manager) => {
            const kb = await this.lock(manager, id)
            const config = await this.taxonomy(manager, kb)
            if (config.revision !== revision) throw this.conflict()
            config.enabled = enabled
            config.revision++
            await manager.save(config)
            return { enabled: config.enabled, revision: config.revision }
        })
    }

    async saveFolder(id: string, input: KnowledgeWikiFolderInput, folderId?: string, version?: number) {
        await this.authorize(id, true)
        const name = input.name.normalize('NFKC').trim()
        if (!name || name.length > 120 || name.includes('/') || input.description.length > 1000)
            throw wikiOrganizationError()
        return this.dataSource.transaction(async (manager) => {
            const kb = await this.lock(manager, id)
            const repo = manager.getRepository(KnowledgeWikiFolder)
            const folders = await repo.findBy({ knowledgebaseId: id })
            if (folders.length >= 200 && !folderId) throw wikiOrganizationError()
            validateWikiFolderMove(
                folders.map((folder) => ({ id: folder.id, parentId: folder.parentId })),
                folderId ?? '',
                input.parentId
            )
            if (
                folders.some(
                    (f) =>
                        f.id !== folderId &&
                        f.parentId === input.parentId &&
                        f.name.normalize('NFKC').toLocaleLowerCase() === name.toLocaleLowerCase()
                )
            )
                throw wikiOrganizationError()
            const current = folderId ? folders.find((f) => f.id === folderId) : null
            if (folderId && (!current || current.version !== version)) throw this.conflict()
            const folder =
                current ??
                repo.create({
                    knowledgebaseId: id,
                    tenantId: kb.tenantId,
                    organizationId: kb.organizationId,
                    version: 0
                })
            Object.assign(folder, { ...input, name, version: folder.version + 1 })
            const saved = await repo.save(folder)
            const config = await this.taxonomy(manager, kb)
            config.revision++
            await manager.save(config)
            return saved
        })
    }

    async deleteFolder(id: string, folderId: string, version: number) {
        await this.authorize(id, true)
        await this.dataSource.transaction(async (manager) => {
            const kb = await this.lock(manager, id)
            const repo = manager.getRepository(KnowledgeWikiFolder)
            const folder = await repo.findOneBy({ id: folderId, knowledgebaseId: id })
            if (!folder || folder.version !== version) throw this.conflict()
            const children = await repo.countBy({ parentId: folderId, knowledgebaseId: id })
            const pages = await manager.getRepository(KnowledgeWikiPlacement).countBy({ folderId, knowledgebaseId: id })
            if (children || pages)
                throw new BadRequestException(
                    t('server-ai:Error.KnowledgebaseWikiFolderNotEmpty', {
                        defaultValue: 'Move child directories and pages before deleting this directory.'
                    })
                )
            await repo.delete(folder.id)
            const config = await this.taxonomy(manager, kb)
            config.revision++
            await manager.save(config)
        })
    }

    async movePage(id: string, pageId: string, folderId: string | null, version: number) {
        await this.authorize(id, true)
        return this.dataSource.transaction(async (manager) => {
            const kb = await this.lock(manager, id)
            const page = await manager.getRepository(KnowledgeWikiPage).findOneBy({ id: pageId, knowledgebaseId: id })
            if (!page || page.pageType === 'index') throw wikiOrganizationError()
            if (
                folderId &&
                !(await manager.getRepository(KnowledgeWikiFolder).existsBy({ id: folderId, knowledgebaseId: id }))
            )
                throw wikiOrganizationError()
            const repo = manager.getRepository(KnowledgeWikiPlacement)
            const current = await repo.findOneBy({ pageId, knowledgebaseId: id })
            if ((current?.version ?? 0) !== version) throw this.conflict()
            const placement =
                current ??
                repo.create({ knowledgebaseId: id, tenantId: kb.tenantId, organizationId: kb.organizationId, pageId })
            Object.assign(placement, { folderId, source: 'manual', version: version + 1 })
            await repo.save(placement)
            return { folderId: placement.folderId, source: placement.source, version: placement.version }
        })
    }

    conflict() {
        return new ConflictException(
            t('server-ai:Error.KnowledgebaseWikiOrganizationConflict', {
                defaultValue: 'Wiki directories or page placement changed. Refresh before applying this change.'
            })
        )
    }
}
