/** @jest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { ExecutionIndicators } from '../execution-indicators'
import { pipelineExecutions } from './executions'
import { texts } from '../i18n'
import { request } from '../bridge'
import type { Attempt } from '../model'
jest.mock('../bridge', () => ({ request: jest.fn() }))
jest.mock('../../../../../shared/coding-tools/coding-tool-icon', () => ({ CodingToolIcon: () => null }))
jest.mock('@xpert-ai/shadcn-ui', () => {
    const React = jest.requireActual<typeof import('react')>('react')
    const box = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
    return {
        Tooltip: box,
        TooltipContent: box,
        TooltipTrigger: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => React.createElement('button', props),
        cn: (...items: string[]) => items.filter(Boolean).join(' ')
    }
})
it('opens the precise visible attempt after lane deduplication and after switching rounds', async () => {
    const send = jest.mocked(request)
    send.mockImplementation(async (method, args) =>
        method === 'executeAction'
            ? {
                  success: true,
                  data: {
                      target: 'assistant.execution',
                      projectId: 'project',
                      conversationId: 'conversation',
                      threadId: 'thread',
                      executionId: args.input.taskExecutionId === 'current' ? 'native-current' : 'native-old'
                  }
              }
            : { success: true }
    )
    const attempts: Attempt[] = [
        { id: 'old', taskId: 'task', attempt: 1, status: 'succeeded', agentExecutionId: 'native-old' },
        {
            id: 'current',
            taskId: 'task',
            attempt: 2,
            status: 'failed',
            runtimeStatus: 'success',
            outputSummary: 'rejected',
            agentExecutionId: 'native-current'
        },
        { id: 'alias', taskId: 'other-task', attempt: 3, status: 'succeeded', agentExecutionId: 'native-current' }
    ]
    const current = [
        { taskIds: ['task'], executionIds: ['current'] },
        { taskIds: ['other-task'], executionIds: ['alias'] }
    ]
    const graph = { nodes: current, tasks: { executions: attempts } }
    const container = document.createElement('div'),
        root = createRoot(container),
        onError = jest.fn()
    document.body.append(container)
    const render = async (nodes: typeof current) =>
        act(async () =>
            root.render(
                React.createElement(ExecutionIndicators, {
                    title: 'Lane',
                    attempts: pipelineExecutions(graph, nodes),
                    locale: 'zh-Hans',
                    t: texts('zh-Hans'),
                    onError
                })
            )
        )
    try {
        await render(current)
        expect(container.querySelectorAll('button')).toHaveLength(1)
        expect(container.querySelector('button span')!.className).toContain('bg-[var(--success)]')
        expect(container.querySelector('button')!.getAttribute('aria-label')).toContain('未通过验收')
        await act(async () => container.querySelector('button')!.click())
        expect(send).toHaveBeenNthCalledWith(1, 'executeAction', {
            actionKey: 'execution-target',
            input: { taskExecutionId: 'current', destination: 'execution' }
        })
        expect(send).toHaveBeenNthCalledWith(
            2,
            'invokeClientCommand',
            expect.objectContaining({ payload: expect.objectContaining({ executionId: 'native-current' }) })
        )
        await render([{ taskIds: ['task'], executionIds: ['old'] }])
        await act(async () => container.querySelector('button')!.click())
        expect(send).toHaveBeenNthCalledWith(3, 'executeAction', {
            actionKey: 'execution-target',
            input: { taskExecutionId: 'old', destination: 'execution' }
        })
        expect(send).toHaveBeenNthCalledWith(
            4,
            'invokeClientCommand',
            expect.objectContaining({ payload: expect.objectContaining({ executionId: 'native-old' }) })
        )
        expect(onError).not.toHaveBeenCalled()
    } finally {
        await act(async () => root.unmount())
        container.remove()
    }
})
