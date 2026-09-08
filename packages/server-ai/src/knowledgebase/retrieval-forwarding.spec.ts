import { QueryBus } from '@nestjs/cqrs'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { createWorkflowRetriever } from '../xpert-agent/workflow/handlers/create-wn-knowledge-retrieval.handler'
import { KnowledgeSearchQuery } from './queries'
import { createKnowledgeRetriever } from './retriever'

describe.each(['agent', 'workflow'] as const)('%s knowledge retrieval overrides', (source) => {
    it.each([undefined, null, 0.7])(
        'preserves the score override %s without introducing a disabled default',
        async (score) => {
            const execute = jest.fn(async (_query: KnowledgeSearchQuery) => ({ documents: [], diagnostics: [] }))
            const queryBus = { execute } as unknown as QueryBus
            const recall = score === undefined ? {} : { score }
            const retriever =
                source === 'agent'
                    ? createKnowledgeRetriever(queryBus, 'kb-1', { recall })
                    : createWorkflowRetriever(queryBus, {
                          id: 'node-1',
                          key: 'knowledge-1',
                          type: WorkflowNodeTypeEnum.KNOWLEDGE,
                          queryVariable: 'query',
                          knowledgebases: ['kb-1'],
                          recall
                      })

            await retriever.invoke('quality requirements')

            const query = execute.mock.calls[0]?.[0]
            expect(query).toBeInstanceOf(KnowledgeSearchQuery)
            if (!(query instanceof KnowledgeSearchQuery)) throw new Error('Expected a knowledge search query')
            expect(query.input.score).toBe(score)
            if (score === undefined) expect(JSON.stringify(query.input)).not.toContain('"score"')
        }
    )

    it.each([undefined, 0, 0.7])('preserves the rerank threshold override %s', async (rerankThreshold) => {
        const execute = jest.fn(async (_query: KnowledgeSearchQuery) => ({ documents: [], diagnostics: [] }))
        const queryBus = { execute } as unknown as QueryBus
        const recall = rerankThreshold === undefined ? {} : { rerankThreshold }
        const retriever =
            source === 'agent'
                ? createKnowledgeRetriever(queryBus, 'kb-1', { recall })
                : createWorkflowRetriever(queryBus, {
                      id: 'node-1',
                      key: 'knowledge-1',
                      type: WorkflowNodeTypeEnum.KNOWLEDGE,
                      queryVariable: 'query',
                      knowledgebases: ['kb-1'],
                      recall
                  })

        await retriever.invoke('quality requirements')

        const query = execute.mock.calls[0]?.[0]
        expect(query).toBeInstanceOf(KnowledgeSearchQuery)
        if (!(query instanceof KnowledgeSearchQuery)) throw new Error('Expected a knowledge search query')
        expect(query.input.rerankThreshold).toBe(rerankThreshold)
        if (rerankThreshold === undefined) expect(JSON.stringify(query.input)).not.toContain('"rerankThreshold"')
    })
})
