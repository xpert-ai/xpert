/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PipelineView } from './view'
import { openProjectWorkspace } from './navigation'
import { readPipeline, readPipelineRounds, listPipelines } from './bridge'
import { getTaskViewState, type PipelineFocus } from '../bridge'
import { restoreTaskView } from '../view-state'
import { approvalGraphFixture } from './__fixtures__/approval-graph'
import type { Swimlane } from './swimlane'

beforeAll(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
})

jest.mock('@xpert-ai/shadcn-ui', () => {
    const React = jest.requireActual<typeof import('react')>('react')
    const box = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
    const TabContext = React.createContext({ value: 'overview', select: (_value: string) => {} })
    return {
        Tabs: ({
            children,
            value,
            defaultValue = 'overview',
            onValueChange
        }: {
            children: React.ReactNode
            value?: string
            defaultValue?: string
            onValueChange?: (value: string) => void
        }) => {
            const [localValue, select] = React.useState(defaultValue)
            return React.createElement(
                TabContext.Provider,
                { value: { value: value ?? localValue, select: onValueChange ?? select } },
                children
            )
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
        DialogHeader: box,
        DialogFooter: box,
        DialogClose: box,
        Badge: box,
        Accordion: box,
        AccordionItem: box,
        AccordionTrigger: box,
        AccordionContent: box,
        DialogTitle: ({ children }: { children: React.ReactNode }) => React.createElement('h2', null, children),
        DialogDescription: box,
        Select: ({
            value,
            onValueChange,
            children
        }: {
            value: string
            onValueChange: (value: string) => void
            children: React.ReactNode
        }) =>
            React.createElement(
                'select',
                { value, onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onValueChange(event.target.value) },
                children
            ),
        SelectTrigger: () => null,
        SelectValue: box,
        SelectContent: React.Fragment,
        SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) =>
            React.createElement('option', { value }, children)
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
jest.mock('../view-visibility', () => ({ useViewVisible: () => true }))
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
jest.mock('./swimlane', () => ({
    Swimlane: ({ graph, lane, selectedLane, onLaneSelect, select }: React.ComponentProps<typeof Swimlane>) => [
        ...graph.definition.lanes
            .filter(({ key }) => !lane || key === lane)
            .map(({ key, label }) =>
                React.createElement(
                    'button',
                    { key, 'aria-pressed': key === selectedLane, onClick: () => onLaneSelect(key) },
                    label
                )
            ),
        ...graph.nodes.map((node) =>
            React.createElement(
                'button',
                { key: node.id, 'data-node': node.id, onClick: () => select(node) },
                node.projection.title
            )
        )
    ]
}))
jest.mock('./timeline', () => ({ ExecutionTimeline: () => null }))

describe('node workbench navigation', () => {
    const graph = approvalGraphFixture()
    const entry = jest.mocked(openProjectWorkspace)
    let container: HTMLDivElement
    let root: ReturnType<typeof createRoot>

    beforeEach(async () => {
        jest.mocked(listPipelines).mockResolvedValue({ items: [], next: null })
        jest.mocked(readPipelineRounds).mockResolvedValue({ items: [], next: null })
        jest.mocked(readPipeline).mockResolvedValue({
            ...graph,
            nodeWorkbench: {},
            cursor: 'rev',
            instance: { ...graph.instance, id: 'order' },
            roundId: 'round',
            round: { ...graph.round, sequence: 1 },
            tasks: { ...graph.tasks, executions: [], tasks: [] },
            permissions: { canEdit: false, canManage: false },
            attentions: []
        })
        entry.mockResolvedValue(undefined)
        container = document.createElement('div')
        root = createRoot(container)
        await act(async () =>
            root.render(
                React.createElement(PipelineView, {
                    locale: 'en-US',
                    projectId: 'project',
                    initialFocus: { pipelineInstanceId: 'order' },
                    onTask: () => {}
                })
            )
        )
    })
    afterEach(async () => {
        await act(async () => root.unmount())
        entry.mockReset()
    })

    const select = (id: string) =>
        act(async () => container.querySelector<HTMLButtonElement>(`[data-node="${id}"]`)!.click())
    const workspaceButton = () =>
        [...container.querySelectorAll<HTMLButtonElement>('[data-dialog] button')].find(
            (button) => button.textContent === 'Open node workspace'
        )!
    const title = () => container.querySelector('[data-dialog] h2')?.textContent

    it('passes exact focus for a provider projection without a native node workbench', async () => {
        const saved = await readPipeline('order')
        const node = saved.nodes[0]
        jest.mocked(readPipeline).mockResolvedValue({
            ...saved,
            nodeWorkbench: undefined,
            historical: false,
            instance: { ...saved.instance, authority: 'provider' },
            nodes: [{ ...node, projection: { ...node.projection, navigation: { kind: 'project_application' } } }]
        })
        await act(async () =>
            root.render(
                React.createElement(PipelineView, {
                    key: 'provider',
                    locale: 'en-US',
                    projectId: 'project',
                    initialFocus: { pipelineInstanceId: 'order' },
                    onTask: () => {}
                })
            )
        )
        await select(node.id)
        await act(async () => workspaceButton().click())
        expect(entry).toHaveBeenCalledWith(
            'project',
            'application',
            expect.any(String),
            node.id,
            'order',
            'round',
            expect.any(AbortSignal)
        )
    })

    it('opens node details first and hands off the exact node and round only from the workspace button', async () => {
        const [node] = graph.nodes
        await select(node.id)
        expect(title()).toBe(node.projection.title)
        expect(entry).not.toHaveBeenCalled()
        entry.mockRejectedValueOnce(Error('unavailable'))
        await act(async () => workspaceButton().click())
        expect(container.querySelector('[data-dialog] [role="alert"]')).not.toBeNull()
        await act(async () => workspaceButton().click())
        expect(entry).toHaveBeenCalledTimes(2)
        expect(entry).toHaveBeenLastCalledWith(
            'project',
            'application',
            expect.any(String),
            node.id,
            'order',
            'round',
            expect.any(AbortSignal)
        )
        expect(container.querySelector('[data-dialog] [role="alert"]')).toBeNull()
    })

    it('keeps B selected when A fails after B opens its workspace', async () => {
        const [a, b] = graph.nodes
        let rejectA!: (error: Error) => void
        let resolveB!: () => void
        entry.mockImplementationOnce(
            () =>
                new Promise<void>((_, reject) => {
                    rejectA = reject
                })
        )
        entry.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    resolveB = resolve
                })
        )

        await select(a.id)
        await act(async () => workspaceButton().click())
        const signalA = entry.mock.calls[0][6]
        await select(b.id)
        expect(signalA?.aborted).toBe(true)
        expect(entry).toHaveBeenCalledTimes(1)
        await act(async () => workspaceButton().click())
        await act(async () => rejectA(Error('late failure')))

        expect(title()).toBe(b.projection.title)
        expect(workspaceButton().disabled).toBe(true)
        expect(container.querySelector('[role="alert"]')).toBeNull()
        await act(async () => resolveB())
        expect(title()).toBe(b.projection.title)
        expect(workspaceButton().disabled).toBe(false)
    })
})

it('restores approval expansion, the service lane filter and its selection when reopened', async () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const graph = approvalGraphFixture()
    jest.mocked(listPipelines).mockResolvedValue({ items: [], next: null })
    jest.mocked(readPipelineRounds).mockResolvedValue({ items: [], next: null })
    jest.mocked(readPipeline).mockResolvedValue({
        ...graph,
        cursor: 'current',
        instance: { ...graph.instance, id, authority: 'platform' },
        round: { ...graph.round, sequence: 1 }
    })
    const container = document.createElement('div')
    const root = createRoot(container)
    const open = async (focus: PipelineFocus) => {
        await act(async () =>
            root.render(
                React.createElement(PipelineView, { locale: 'en-US', initialFocus: focus, onTask: () => undefined })
            )
        )
    }
    const close = async () => {
        await act(async () => root.render(null))
    }
    const button = (label: string) =>
        [...container.querySelectorAll('button')].find((item) => item.textContent === label)
    const filter = () => container.querySelector<HTMLOptionElement>('option[value="__all"]')!.closest('select')!
    const expectExpanded = () => {
        expect(button('Expand approval steps')?.getAttribute('aria-pressed')).toBe('true')
        expect(filter().value).toBe('machine')
        expect(button('machine')?.getAttribute('aria-pressed')).toBe('true')
    }
    try {
        await open({ pipelineInstanceId: id })
        expect(button('Expand approval steps')?.getAttribute('aria-pressed')).toBe('false')
        expect(button('machine')).toBeUndefined()
        await act(async () => button('Expand approval steps')!.click())
        await act(async () => {
            const select = filter()
            select.value = 'machine'
            select.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await act(async () => button('machine')!.click())
        const saved = getTaskViewState()
        expect(saved).toMatchObject({ showApprovalSteps: true, pipelineLane: 'machine', selectedLane: 'machine' })
        await close()
        await open(restoreTaskView(saved, { pipelineInstanceId: id }))
        expectExpanded()
        await act(async () => button('Expand approval steps')!.click())
        const collapsed = getTaskViewState()
        expect(collapsed).toMatchObject({ showApprovalSteps: false, pipelineLane: '', selectedLane: '' })
        await close()
        await open(restoreTaskView(collapsed))
        expect(button('Expand approval steps')?.getAttribute('aria-pressed')).toBe('false')
        expect(filter().value).toBe('__all')
        expect(button('machine')).toBeUndefined()
        await close()
        await open(restoreTaskView({ pipelineInstanceId: id, pipelineLane: 'machine', selectedLane: 'machine' }))
        expectExpanded()
    } finally {
        await act(async () => root.unmount())
    }
})

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
        const tabs = container.querySelectorAll<HTMLButtonElement>('[data-dialog] [role=tab]')
        await act(async () => {
            tabs[1].click()
        })
        expect(container.querySelector('[data-dialog] [role=tabpanel]:not([hidden])')?.textContent).toContain(
            '本轮次暂无执行记录'
        )
        expect(entries()).toHaveLength(1)
        await act(async () => {
            jest.advanceTimersByTime(5000)
        })
        expect(tabs[1].getAttribute('aria-selected')).toBe('true')
        await act(async () => {
            tabs[0].click()
        })
        expect(container.querySelector('[data-dialog] [role=tabpanel]:not([hidden])')?.textContent).toContain(
            '基本信息'
        )
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
