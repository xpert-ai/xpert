import { KnowledgeWikiIdentityDescriptor } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import {
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiPageLinkEntity,
    KnowledgeWikiPageVersion
} from './entities'
import { KnowledgeWikiLinkService } from './knowledge-wiki-link.service'

const descriptor: KnowledgeWikiIdentityDescriptor = {
    kind: 'entity',
    entityType: 'organization',
    description: 'North team',
    scope: null,
    identifiers: []
}
function page(id: string, canonicalName: string, aliases: string[]) {
    return Object.assign(new KnowledgeWikiPage(), {
        id,
        knowledgebaseId: 'kb',
        pageKey: `entity:${id}`,
        pageType: 'entity',
        canonicalName,
        identity: { descriptor, aliases, embedding: null }
    })
}

describe('Wiki links after identity resolution', () => {
    async function stage(targets: KnowledgeWikiPage[], targetCanonicalName: string) {
        const pages = { find: jest.fn(async () => targets) }
        const contributions = {
            find: jest.fn(async () => [
                { payload: { suggestedLinks: [{ targetType: 'entity', targetCanonicalName }] } }
            ])
        }
        const links = {
            delete: jest.fn(),
            create: (value: Partial<KnowledgeWikiPageLinkEntity>) =>
                Object.assign(new KnowledgeWikiPageLinkEntity(), value),
            save: jest.fn()
        }
        const service = new KnowledgeWikiLinkService(
            pages as unknown as Repository<KnowledgeWikiPage>,
            contributions as unknown as Repository<KnowledgeWikiPageContribution>,
            links as unknown as Repository<KnowledgeWikiPageLinkEntity>
        )
        await service.stageGeneratedLinks(
            Object.assign(new Knowledgebase(), { id: 'kb' }),
            page('source', 'Source', []),
            Object.assign(new KnowledgeWikiPageVersion(), { id: 'version' })
        )
        return links
    }

    it('resolves a confirmed alternate name to its stable page id', async () => {
        const links = await stage([page('north-id', 'North Operations', ['Northern Team'])], 'Northern Team')
        expect(links.save).toHaveBeenCalledWith([
            expect.objectContaining({ targetPageId: 'north-id', sourcePageVersionId: 'version' })
        ])
    })

    it('does not pick an arbitrary target when two distinct identities share a name', async () => {
        const links = await stage([page('north', 'Operations', []), page('south', 'Operations', [])], 'Operations')
        expect(links.save).not.toHaveBeenCalled()
    })

    it('does not create an unresolved or self link', async () => {
        expect((await stage([page('source', 'Source', [])], 'Source')).save).not.toHaveBeenCalled()
        expect((await stage([page('north', 'North', [])], 'Invented alias')).save).not.toHaveBeenCalled()
    })
})
