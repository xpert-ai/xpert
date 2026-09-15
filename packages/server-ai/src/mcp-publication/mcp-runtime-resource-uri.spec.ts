import { McpResourceUriTemplate } from './mcp-resource-uri-template'
import { toMcpReadResourceResult } from './mcp-runtime-protocol'

describe('MCP paginated resource URI contract', () => {
    const template = new McpResourceUriTemplate('cut://projects/{projectId}/caption-drafts/{draftId}{?page,pageSize}')
    it('extracts a second caption page from the advertised URI template', () => {
        const uri = 'cut://projects/project/caption-drafts/draft?page=2&pageSize=100'
        expect(template.match(uri)).toEqual({ projectId: 'project', draftId: 'draft', page: '2', pageSize: '100' })
        expect(toMcpReadResourceResult({ contents: [{ uri, text: '{"page":2}' }] }, uri)).toMatchObject({
            contents: [{ uri }]
        })
    })
    it('retains reads without optional parameters', () => {
        expect(template.match('cut://projects/project/caption-drafts/draft')).toEqual({
            projectId: 'project',
            draftId: 'draft'
        })
    })
    it.each(['?page=2', '?pageSize=100', '?pageSize=100&page=2'])(
        'accepts optional query subsets and ordering: %s',
        (query) => {
            expect(template.match(`cut://projects/project/caption-drafts/draft${query}`)).toMatchObject({
                projectId: 'project',
                draftId: 'draft'
            })
        }
    )
    it.each(['?page=1&page=2', '?projectId=other', '?userId=other', '?page=', '?page=%ZZ', '#other'])(
        'rejects ambiguous or undeclared inputs: %s',
        (query) => {
            expect(template.match(`cut://projects/project/caption-drafts/draft${query}`)).toBeNull()
        }
    )
    it('rejects a response that silently drops the requested page', () => {
        expect(() =>
            toMcpReadResourceResult(
                { contents: [{ uri: 'cut://projects/project/caption-drafts/draft', text: '{}' }] },
                'cut://projects/project/caption-drafts/draft?page=2'
            )
        ).toThrow('undeclared URI')
    })
})
