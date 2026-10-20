/** @jest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { PipelineView } from './view'
import { readPipeline, readPipelineRounds, listPipelines } from './bridge'

jest.mock('@xpert-ai/shadcn-ui', () => {
    const React = jest.requireActual<typeof import('react')>('react')
    const box = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
    const TabContext = React.createContext({ value: 'overview', select: (_value: string) => {} })
    return {
        Tabs: ({ children }: { children: React.ReactNode }) => {
            const [value, select] = React.useState('overview')
            return React.createElement(TabContext.Provider, { value: { value, select } }, children)
        },
        TabsList: box,
        TabsTrigger: ({ value, children }: { value: string; children: React.ReactNode }) => {
            const tabs = React.useContext(TabContext)
            return React.createElement(
                'button',
                { role: 'tab', 'aria-selected': value === tabs.value, onClick: () => tabs.select(value) },
                children
            )
        },
        TabsContent: ({ value, children }: { value: string; children: React.ReactNode }) =>
            React.createElement(
                'div',
                { role: 'tabpanel', hidden: value !== React.useContext(TabContext).value },
                children
            ),
        Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
            React.createElement('button', props, children),
        Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
            open ? React.createElement('section', { 'data-dialog': true }, children) : null,
        DialogContent: box,
        DialogTitle: box,
        DialogDescription: box,
        Select: () => null,
        SelectTrigger: box,
        SelectValue: box,
        SelectContent: box,
        SelectItem: box
    }
})
jest.mock('lucide-react', () => ({
    RefreshCw: () => null,
    Workflow: () => null,
    Clock3: () => null,
    X: () => null,
    FileText: () => null,
    ExternalLink: () => null,
    ChevronRight: () => null
}))
jest.mock('./bridge', () => ({ readPipeline: jest.fn(), readPipelineRounds: jest.fn(), listPipelines: jest.fn() }))
jest.mock('./navigation', () => ({ openProjectWorkspace: jest.fn() }))
jest.mock('../execution-navigation', () => ({ openTaskExecution: jest.fn() }))
jest.mock('./context', () => ({ usePipelineContext: () => undefined }))
jest.mock('./node-diagnostics', () => ({ NodeDiagnostics: () => null }))
jest.mock('./node-presentation', () => ({ NodePresentation: () => null }))
jest.mock('./lane-details', () => ({ LaneDetails: () => null }))
jest.mock('./statistics', () => ({ PipelineStatistics: () => null }))
jest.mock('./analytics', () => ({ PipelineAnalytics: () => null }))
jest.mock('./attention-list', () => ({ PipelineAttentionList: () => null }))
jest.mock('./attention', () => ({ PipelineAttention: () => null }))
jest.mock('./lifecycle', () => ({ PipelineLifecycle: () => null }))
jest.mock('./configuration', () => ({ PipelineConfiguration: () => null }))
jest.mock('./evidence', () => ({ PipelineEvidence: () => null }))
jest.mock('./provider-actions', () => ({ ProviderActions: () => null }))
jest.mock('./pipeline-heading', () => ({
    PipelineHeading: ({
        items,
        hasMore,
        onMore
    }: {
        items: Array<{ id: string; title: string }>
        hasMore: boolean
        onMore: () => void
    }) =>
        React.createElement(
            'div',
            { 'data-heading': true },
            items.map((item) => React.createElement('span', { key: item.id }, item.title)),
            hasMore && React.createElement('button', { onClick: onMore }, 'More pipelines')
        )
}))
jest.mock('./swimlane', () => ({ Swimlane: () => null }))
jest.mock('./timeline', () => ({ ExecutionTimeline: () => null }))

it('keeps one workspace entry through repeated polling updates and removes it for history', async () => {
    jest.useFakeTimers()
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let revision = 0,
        historical = false
    jest.mocked(listPipelines).mockResolvedValue({ items: [], next: null })
    jest.mocked(readPipelineRounds).mockResolvedValue({ items: [], next: null })
    jest.mocked(readPipeline).mockImplementation(
        async () =>
            ({
                cursor: String(++revision),
                historical,
                instance: { id: 'instance', authority: 'provider', updatedAt: '' },
                round: { sequence: 1 },
                roundId: 'round',
                historyComplete: true,
                permissions: { canEdit: true },
                definition: { lanes: [], stages: [] },
                nodes: [
                    {
                        id: 'node',
                        taskIds: [],
                        projection: {
                            key: 'node',
                            nodeKey: 'work',
                            expansionKey: 'root',
                            title: 'Review',
                            kind: 'human_gate',
                            navigation: { kind: 'project_application' },
                            evidence: [],
                            state: {
                                lifecycle: 'pending',
                                runtime: 'none',
                                readiness: 'waiting',
                                applicability: 'selected',
                                freshness: 'current'
                            }
                        }
                    }
                ],
                tasks: { tasks: [], executions: [] },
                attentions: [],
                edges: []
            }) as Awaited<ReturnType<typeof readPipeline>>
    )
    const entries = () =>
        [...container.querySelectorAll('[data-dialog] button')].filter(
            (button) => button.textContent === '打开节点工作台'
        )
    try {
        await act(async () => {
            root.render(
                React.createElement(PipelineView, {
                    locale: 'zh-Hans',
                    projectId: 'project',
                    onTask: () => undefined,
                    initialFocus: { pipelineInstanceId: 'instance', pipelineNodeId: 'node' }
                })
            )
        })
        expect(entries()).toHaveLength(1)
        for (let tick = 0; tick < 30; tick++) {
            await act(async () => {
                jest.advanceTimersByTime(5000)
            })
            expect(entries()).toHaveLength(1)
        }
        const tabs = container.querySelectorAll<HTMLButtonElement>('[role=tab]')
        await act(async () => {
            tabs[1].click()
        })
        expect(container.querySelector('[role=tabpanel]:not([hidden])')?.textContent).toContain('本轮次暂无执行记录')
        expect(entries()).toHaveLength(1)
        await act(async () => {
            jest.advanceTimersByTime(5000)
        })
        expect(tabs[1].getAttribute('aria-selected')).toBe('true')
        await act(async () => {
            tabs[0].click()
        })
        expect(container.querySelector('[role=tabpanel]:not([hidden])')?.textContent).toContain('基本信息')
        historical = true
        await act(async () => {
            jest.advanceTimersByTime(5000)
        })
        expect(entries()).toHaveLength(0)
        expect(
            errors.mock.calls.some((args) => args.some((arg) => typeof arg === 'string' && arg.includes('same key')))
        ).toBe(false)
    } finally {
        await act(async () => root.unmount())
        container.remove()
        jest.useRealTimers()
        errors.mockRestore()
    }
})

it('preserves loaded pipeline pages while polling an explicitly selected instance', async () => {
    jest.useFakeTimers()
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    const container = document.createElement('div'),
        root = createRoot(container)
    const first = { id: 'first', title: 'First flow' },
        second = { id: 'second', title: 'Second flow' }
    jest.mocked(listPipelines)
        .mockReset()
        .mockResolvedValueOnce({ items: [first], next: 'page-2' } as Awaited<ReturnType<typeof listPipelines>>)
        .mockResolvedValueOnce({ items: [second], next: null } as Awaited<ReturnType<typeof listPipelines>>)
        .mockResolvedValue({ items: [first], next: 'page-2' } as Awaited<ReturnType<typeof listPipelines>>)
    jest.mocked(readPipelineRounds).mockResolvedValue({ items: [], next: null })
    jest.mocked(readPipeline).mockResolvedValue({
        cursor: 'unchanged',
        instance: first,
        round: { sequence: 1 },
        roundId: 'round',
        definition: { lanes: [], stages: [] },
        nodes: [],
        tasks: { tasks: [], executions: [] },
        attentions: [],
        edges: []
    } as Awaited<ReturnType<typeof readPipeline>>)
    try {
        await act(async () =>
            root.render(
                React.createElement(PipelineView, {
                    locale: 'en-US',
                    onTask: () => undefined,
                    initialFocus: { pipelineInstanceId: 'first' }
                })
            )
        )
        await act(async () => container.querySelector<HTMLButtonElement>('[data-heading] button')!.click())
        expect(container.querySelector('[data-heading]')!.textContent).toContain('Second flow')
        await act(async () => jest.advanceTimersByTime(5000))
        expect(listPipelines).toHaveBeenCalledTimes(2)
        expect(container.querySelector('[data-heading]')!.textContent).toContain('Second flow')
    } finally {
        await act(async () => root.unmount())
        jest.useRealTimers()
        errors.mockRestore()
    }
})
