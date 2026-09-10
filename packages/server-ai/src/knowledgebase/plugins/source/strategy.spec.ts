import { Document } from '@langchain/core/documents'
import { resolveWorkflowSourceDocumentSourceKey, WorkflowSourceNodeStrategy } from './strategy'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    channelName,
    IEnvironment,
    KnowledgebaseChannel,
    KnowledgeTask,
    TXpertGraph,
    TXpertTeamNode,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { AgentStateAnnotation } from '../../../shared'

describe('WorkflowSourceNodeStrategy source identity', () => {
    it('uses the document saved before dispatch instead of creating it again', async () => {
        const strategy = new WorkflowSourceNodeStrategy(
            { execute: jest.fn(async () => ({ id: 'execution' })) } as unknown as CommandBus,
            { execute: jest.fn(async () => ({ id: 'execution' })) } as unknown as QueryBus
        )
        const createBulk = jest.fn()
        Object.assign(strategy, {
            documentService: { createBulk },
            taskService: {
                findOne: jest.fn(async () => ({
                    context: { documents: [{ id: 'preview' }], materializedSources: { source: { preview: 'saved' } } },
                    documents: [{ id: 'saved', name: 'small.md' }]
                }))
            }
        })
        const { graph } = strategy.create({
            graph: { nodes: [], connections: [] } as TXpertGraph,
            node: {
                key: 'source',
                type: 'workflow',
                entity: { type: WorkflowNodeTypeEnum.SOURCE }
            } as TXpertTeamNode & { type: 'workflow' },
            xpertId: 'pipeline',
            environment: {} as IEnvironment,
            isDraft: false
        })
        const state = await graph.invoke(
            {
                [KnowledgebaseChannel]: { knowledgebaseId: 'kb', [KnowledgeTask]: 'task', stage: 'prod' },
                [channelName('source')]: { documents: ['saved'] }
            } as unknown as typeof AgentStateAnnotation.State,
            { configurable: {} }
        )
        expect(state[channelName('source')].documents).toEqual([expect.objectContaining({ id: 'saved' })])
        expect(createBulk).not.toHaveBeenCalled()
    })

    it('derives a source key from external source token metadata', () => {
        const document = new Document({
            id: 'docx-token',
            pageContent: 'Lark Document docx-token',
            metadata: {
                token: 'docx-token',
                type: 'docx',
                title: 'Lark Document docx-token'
            }
        })

        expect(
            resolveWorkflowSourceDocumentSourceKey({
                document,
                sourceType: 'lark',
                sourceConfigKey: 'Source_1'
            })
        ).toBe('lark:Source_1:docx-token')
    })

    it('does not derive a source key from display-only source metadata', () => {
        const document = new Document({
            pageContent: 'Policy',
            metadata: {
                title: 'Policy',
                originalName: 'Policy.docx'
            }
        })

        expect(
            resolveWorkflowSourceDocumentSourceKey({
                document,
                sourceType: 'lark',
                sourceConfigKey: 'Source_1'
            })
        ).toBeNull()
    })
})
