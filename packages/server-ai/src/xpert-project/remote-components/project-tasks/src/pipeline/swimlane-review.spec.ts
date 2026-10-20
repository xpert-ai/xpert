/** @jest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { Swimlane } from './swimlane'
import { pipelineTexts } from './i18n'
import type { PipelineGraph } from './bridge'
import { openTaskExecution } from '../execution-navigation'

jest.mock('../bridge', () => ({ saveTaskViewState: jest.fn() }))
jest.mock('../execution-navigation', () => ({ openTaskExecution: jest.fn() }))
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
it('renders configured labels/icons and inline controls while keeping node and lane execution clicks exact', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const state = {
        lifecycle: 'active',
        readiness: 'ready',
        applicability: 'selected',
        freshness: 'current',
        runtime: 'succeeded'
    }
    const graph = {
        instance: { title: 'Neutral flow' },
        round: { sequence: 3 },
        definition: {
            lanes: [{ key: 'role', label: 'Review role', roleKey: 'reviewer', order: 0 }],
            stages: [
                { key: 'check', label: 'Configured check', icon: 'code', order: 0 },
                { key: 'route', label: 'Control', order: 1 },
                { key: 'finish', label: 'Configured finish', icon: 'shield-check', order: 2 }
            ]
        },
        nodes: [
            {
                id: 'node',
                taskIds: ['task'],
                executionIds: ['current', 'alias'],
                projection: { key: 'check', kind: 'work', title: 'Check', laneKey: 'role', stageKey: 'check', state }
            },
            {
                id: 'control',
                taskIds: [],
                executionIds: [],
                projection: { key: 'route', kind: 'router', title: 'Route', laneKey: null, stageKey: 'route', state }
            },
            {
                id: 'finish',
                taskIds: ['task'],
                executionIds: [],
                projection: { key: 'finish', kind: 'work', title: 'Finish', laneKey: 'role', stageKey: 'finish', state }
            }
        ],
        edges: [
            { key: 'edge', from: 'route', to: 'finish', label: '满足配置中的审核条件后继续', selection: 'selected' }
        ],
        tasks: {
            tasks: [{ id: 'task', title: 'Review item' }],
            executions: [
                { id: 'old', taskId: 'task', attempt: 1, status: 'succeeded', agentExecutionId: 'old-native' },
                { id: 'current', taskId: 'task', attempt: 2, status: 'succeeded', agentExecutionId: 'current-native' },
                { id: 'alias', taskId: 'task', attempt: 3, status: 'succeeded', agentExecutionId: 'current-native' }
            ]
        }
    } as PipelineGraph
    const container = document.createElement('div'),
        root = createRoot(container)
    const select = jest.fn(),
        onLaneSelect = jest.fn()
    try {
        await act(async () =>
            root.render(
                React.createElement(Swimlane, {
                    graph,
                    locale: 'zh-Hans',
                    t: pipelineTexts('zh-Hans'),
                    lane: '',
                    selected: null,
                    select,
                    onError: jest.fn(),
                    onLane: jest.fn(),
                    selectedLane: '',
                    onLaneSelect
                })
            )
        )
        expect(container.querySelectorAll('svg.lucide-code')).toHaveLength(2)
        expect(container.querySelectorAll('svg.lucide-shield-check')).toHaveLength(2)
        expect(container.textContent).toContain('Configured check')
        const condition = container.querySelector('svg text')!
        expect([...condition.querySelectorAll('tspan')].map((line) => line.textContent).join('')).toBe(
            graph.edges[0].label
        )
        const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')]
        const check = buttons.find(
            (button) => button.textContent?.includes('Neutral flow') && button.textContent?.includes('Check')
        )!
        const control = buttons.find((button) => button.textContent?.includes('Route'))!
        expect(check.parentElement!.style.top).toBe(control.style.top)
        expect(check.parentElement!.textContent).not.toContain('Assistant')
        const dots = buttons.filter((button) => button.getAttribute('aria-label')?.includes('次执行'))
        expect(dots).toHaveLength(2) // One node dot and one deduplicated lane dot; no old-round or sibling dot.
        await act(async () => dots[1].click())
        expect(openTaskExecution).toHaveBeenCalledWith('current', expect.any(String))
        expect(select).not.toHaveBeenCalled()
        await act(async () => check.click())
        expect(select).toHaveBeenCalledWith(graph.nodes[0])
        await act(async () => buttons.find((button) => button.textContent === 'Review role')!.click())
        expect(onLaneSelect).toHaveBeenCalledWith('role')
    } finally {
        await act(async () => root.unmount())
        errors.mockRestore()
    }
})
