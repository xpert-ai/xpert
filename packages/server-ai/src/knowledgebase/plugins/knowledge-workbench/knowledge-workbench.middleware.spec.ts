jest.mock('@xpert-ai/plugin-sdk', () => ({
    AgentMiddlewareStrategy: () => () => undefined
}))
jest.mock('./knowledge-workbench.service', () => ({
    KnowledgeWorkbenchService: class KnowledgeWorkbenchService {}
}))

import { IWFNMiddleware, WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import {
    KNOWLEDGE_WORKBENCH_FEATURE,
    KNOWLEDGE_WORKBENCH_LIST_DOCUMENTS_TOOL,
    KNOWLEDGE_WORKBENCH_OPEN_TOOL,
    KNOWLEDGE_WORKBENCH_PREVIEW_DOCUMENT_TOOL,
    KNOWLEDGE_WORKBENCH_PROVIDER_KEY,
    KNOWLEDGE_WORKBENCH_SEARCH_TOOL
} from './constants'
import { KnowledgeWorkbenchMiddleware } from './knowledge-workbench.middleware'
import type { KnowledgeWorkbenchService } from './knowledge-workbench.service'

describe('KnowledgeWorkbenchMiddleware', () => {
    it('exposes the knowledge workbench feature and tools', async () => {
        const strategy = new KnowledgeWorkbenchMiddleware(createService() as unknown as KnowledgeWorkbenchService)
        const middleware = await strategy.createMiddleware({}, createContext())

        expect(strategy.meta.name).toBe(KNOWLEDGE_WORKBENCH_PROVIDER_KEY)
        expect(strategy.meta.features).toContain(KNOWLEDGE_WORKBENCH_FEATURE)
        expect(middleware.name).toBe(KNOWLEDGE_WORKBENCH_PROVIDER_KEY)
        expect(middleware.contextSchema).toBeTruthy()
        expect(middleware.tools?.map((item) => item.name)).toEqual([
            KNOWLEDGE_WORKBENCH_OPEN_TOOL,
            KNOWLEDGE_WORKBENCH_SEARCH_TOOL,
            KNOWLEDGE_WORKBENCH_LIST_DOCUMENTS_TOOL,
            KNOWLEDGE_WORKBENCH_PREVIEW_DOCUMENT_TOOL
        ])
        const searchTool = middleware.tools?.find((item) => item.name === KNOWLEDGE_WORKBENCH_SEARCH_TOOL)
        expect(searchTool?.description).toContain('Use the exact citationMarkdown string verbatim')
        expect(searchTool?.description).toContain('[label](url)')
    })

    it('passes selected workbench documents into the search service', async () => {
        const service = createService()
        const middleware = await new KnowledgeWorkbenchMiddleware(
            service as unknown as KnowledgeWorkbenchService
        ).createMiddleware({}, createContext())
        const searchTool = middleware.tools?.find((item) => item.name === KNOWLEDGE_WORKBENCH_SEARCH_TOOL)

        const result = await searchTool?.invoke(
            {
                query: '工艺质量',
                topK: 4
            },
            {
                configurable: {
                    context: {
                        knowledgebase_workbench: {
                            knowledgebaseId: 'kb-1',
                            documentIds: ['doc-1'],
                            documents: [{ id: 'doc-1', name: '质量手册.pdf' }]
                        }
                    }
                }
            } as any
        )

        expect(service.searchDocuments).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                allowedKnowledgebaseIds: ['kb-1', 'kb-2'],
                query: '工艺质量',
                knowledgebaseId: 'kb-1',
                documentIds: ['doc-1'],
                topK: 4
            })
        )
        expect(JSON.parse(String(result))).toEqual(
            expect.objectContaining({
                knowledgebaseId: 'kb-1',
                selectedDocuments: [{ id: 'doc-1', name: '质量手册.pdf' }]
            })
        )
    })

    it('rejects opening the view when the requested knowledgebase is not connected', async () => {
        const middleware = await new KnowledgeWorkbenchMiddleware(
            createService() as unknown as KnowledgeWorkbenchService
        ).createMiddleware({}, createContext({ knowledgebaseIds: ['kb-1'] }))
        const openTool = middleware.tools?.find((item) => item.name === KNOWLEDGE_WORKBENCH_OPEN_TOOL)

        await expect(openTool?.invoke({ knowledgebaseId: 'kb-x' })).rejects.toThrow(
            'The selected knowledgebase is not connected to the current agent'
        )
    })
})

function createService() {
    return {
        resolveKnowledgebaseId: jest.fn((knowledgebaseId: string | undefined, allowed: string[]) => {
            if (knowledgebaseId) {
                return allowed.includes(knowledgebaseId) ? knowledgebaseId : undefined
            }
            return allowed[0]
        }),
        searchDocuments: jest.fn(async () => ({
            query: '工艺质量',
            knowledgebaseId: 'kb-1',
            documentIds: ['doc-1'],
            chunks: [
                {
                    index: 1,
                    chunkId: 'chunk-1',
                    documentId: 'doc-1',
                    documentName: '质量手册.pdf',
                    citationUrl: 'xpert://knowledgebase/chunk?knowledgebaseId=kb-1&documentId=doc-1&chunkId=chunk-1',
                    citationMarkdown:
                        '[⟦1⟧](xpert://knowledgebase/chunk?knowledgebaseId=kb-1&documentId=doc-1&chunkId=chunk-1)',
                    snippet: '质量控制内容'
                }
            ],
            citations: [
                {
                    index: 1,
                    chunkId: 'chunk-1',
                    documentId: 'doc-1',
                    documentName: '质量手册.pdf',
                    citationUrl: 'xpert://knowledgebase/chunk?knowledgebaseId=kb-1&documentId=doc-1&chunkId=chunk-1',
                    citationMarkdown:
                        '[⟦1⟧](xpert://knowledgebase/chunk?knowledgebaseId=kb-1&documentId=doc-1&chunkId=chunk-1)',
                    snippet: '质量控制内容'
                }
            ],
            message: 'Found 1 relevant chunk(s).'
        }))
    }
}

function createContext(overrides: Partial<IAgentMiddlewareContext> = {}): IAgentMiddlewareContext {
    return {
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
        projectId: 'project-1',
        conversationId: 'conversation-1',
        xpertId: 'xpert-1',
        agentKey: 'agent-1',
        knowledgebaseIds: ['kb-1', 'kb-2'],
        node: {
            key: KNOWLEDGE_WORKBENCH_PROVIDER_KEY,
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            entity: {
                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                provider: KNOWLEDGE_WORKBENCH_PROVIDER_KEY
            }
        } as unknown as IWFNMiddleware,
        tools: new Map(),
        runtime: {} as IAgentMiddlewareContext['runtime'],
        ...overrides
    }
}
