jest.mock('./document.service', () => ({ KnowledgeDocumentService: class {} }))
jest.mock('../knowledgebase/tags/knowledge-tag.service', () => ({ KnowledgeTagService: class {} }))
import { BadRequestException } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { KnowledgeDocumentImportService, parseDocumentImport } from './document-import.service'
import { KnowledgeDocumentService } from './document.service'
import { KnowledgeTagService } from '../knowledgebase/tags/knowledge-tag.service'

const tagId = '00000000-0000-0000-0000-000000000001'

describe('tagged document import', () => {
    it('preserves legacy input and deduplicates batch tags', () => {
        const documents = [{ knowledgebaseId: 'kb', name: 'doc' }]
        expect(parseDocumentImport(documents)).toEqual({ documents, tagIds: [] })
        expect(parseDocumentImport({ documents, tagIds: [tagId, tagId] })).toEqual({ documents, tagIds: [tagId] })
    })

    it.each([
        null,
        {},
        { documents: [], tagIds: [tagId] },
        { documents: [null], tagIds: [] },
        { documents: [{ knowledgebaseId: 'kb' }], tagIds: 'tag' },
        { documents: [{ knowledgebaseId: 'kb' }], tagIds: [1] },
        { documents: [{ knowledgebaseId: 'kb' }], tagIds: ['not-a-uuid'] },
        { documents: [{ knowledgebaseId: 'a' }, { knowledgebaseId: 'b' }], tagIds: [tagId] }
    ])('rejects malformed or cross-knowledgebase tag requests: %p', (input) => {
        expect(() => parseDocumentImport(input as never)).toThrow(BadRequestException)
    })

    function setup(failTags = false) {
        const events: string[] = []
        const manager = {} as EntityManager
        const result = { documents: [{ id: 'doc', knowledgebaseId: 'kb' }], processableIds: ['doc'] }
        const db = {
            transaction: jest.fn(async (run: (manager: EntityManager) => Promise<unknown>) => {
                events.push('begin')
                try {
                    const value = await run(manager)
                    events.push('commit')
                    return value
                } catch (error) {
                    events.push('rollback')
                    throw error
                }
            })
        }
        const documents = {
            resolveNewDocumentParserConfig: jest.fn(async () => events.push('prepare')),
            createBulkWithIncrementalSync: jest.fn(async () => {
                events.push('documents')
                return result
            })
        }
        const tags = {
            lockImportKnowledgebase: jest.fn(async () => {
                events.push('lock')
                return { id: 'kb' }
            }),
            assignImported: jest.fn(async () => {
                events.push('tags')
                if (failTags) throw new Error('unavailable tag')
            })
        }
        const service = new KnowledgeDocumentImportService(
            db as unknown as DataSource,
            documents as unknown as KnowledgeDocumentService,
            tags as unknown as KnowledgeTagService
        )
        return { service, events, documents, tags, manager, result }
    }

    it('writes manual tags in the same transaction before returning processable documents', async () => {
        const f = setup()
        const input = [{ knowledgebaseId: 'kb' }]
        expect(await f.service.create(input, [tagId])).toBe(f.result)
        expect(f.events).toEqual(['prepare', 'begin', 'lock', 'documents', 'tags', 'commit'])
        expect(f.documents.createBulkWithIncrementalSync).toHaveBeenCalledWith(input, f.manager)
        expect(f.tags.assignImported).toHaveBeenCalledWith(f.manager, { id: 'kb' }, f.result.documents, [tagId])
    })

    it('propagates tag failure through the document transaction without returning success', async () => {
        const f = setup(true)
        await expect(f.service.create([{ knowledgebaseId: 'kb' }], [tagId])).rejects.toThrow('unavailable tag')
        expect(f.events).toEqual(['prepare', 'begin', 'lock', 'documents', 'tags', 'rollback'])
    })
})
