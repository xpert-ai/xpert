/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Gantt } from './gantt'
import { ExecutionIndicators } from './execution-indicators'
import { columnDefaults } from './columns'
import { texts } from './i18n'
import type { Graph, Node } from './bridge'
import type { Attempt } from './model'

jest.mock('@xpert-ai/shadcn-ui', () => ({
    cn: (...values: (string | boolean | undefined)[]) => values.filter(Boolean).join(' '),
    Tooltip: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    TooltipTrigger: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />,
    TooltipContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>
}))
jest.mock('./task-views', () => ({
    TASK_ROW_HEIGHT: 40,
    TASK_HEADER_HEIGHT: 36,
    useVirtualRows: (length: number) => ({
        ref: React.useRef(null),
        viewport: { top: 0, height: 600, width: 1000 },
        start: 0,
        end: length,
        onScroll: () => undefined
    })
}))
jest.mock('./ui', () => ({ Status: () => null, TaskName: () => null }))
jest.mock('./assignee', () => ({ Assignee: () => null }))
jest.mock('../../../../shared/coding-tools/coding-tool-icon', () => ({ CodingToolIcon: () => null }))
jest.mock('./execution-navigation', () => ({ openTaskExecution: jest.fn() }))

const start = '2026-10-26T10:00:00Z'
const end = '2026-10-26T11:00:00Z'
const task: Node = {
    id: 'task',
    title: 'Retry history',
    status: 'blocked',
    kind: 'task',
    parentTaskId: null,
    predecessorIds: [],
    providerKey: null,
    sourceKey: null,
    revision: 1,
    plannedStartAt: start,
    plannedEndAt: end,
    estimatedDurationMs: null,
    actualStartAt: null,
    actualEndAt: null,
    diagnostic: null,
    assigneeXpertId: null
}
const attempt = (id: string, state: string, patch: Partial<Attempt> = {}): Attempt => ({
    id,
    taskId: task.id,
    attempt: 1,
    status: state,
    runtimeStatus: state,
    runtimeStartedAt: start,
    runtimeCompletedAt: end,
    ...patch
})
let container: HTMLDivElement
let root: Root
const select = jest.fn()
beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    select.mockClear()
})
afterEach(() => {
    act(() => root.unmount())
    container.remove()
})
function render(value: Node, executions: Attempt[], locale = 'en') {
    const t = texts(locale)
    const graph: Graph = { projectId: 'project', cursor: '1', tasks: [value], executions, diagnostics: [] }
    act(() =>
        root.render(
            <>
                <Gantt
                    graph={graph}
                    rows={[{ type: 'task', task: value, depth: 0, hasChildren: false, contextOnly: false }]}
                    selected={null}
                    select={select}
                    collapsed={new Set()}
                    toggle={() => undefined}
                    t={t}
                    locale={locale}
                    fields={{ status: false, assignee: false, attempts: false, dates: false }}
                    grouping="none"
                    columns={{ widths: columnDefaults, resize: () => undefined }}
                    onError={() => undefined}
                    forecasts={[{ taskId: value.id, startAt: start, endAt: end, affected: false, critical: true }]}
                    now={Date.parse(end)}
                    renderToolbar={() => null}
                />
                <div data-indicators="">
                    <ExecutionIndicators
                        title={value.title}
                        attempts={executions}
                        t={t}
                        locale={locale}
                        onError={() => undefined}
                    />
                </div>
            </>
        )
    )
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('[data-task-scroll="gantt"] button'))
    return {
        actuals: buttons.filter((button) => button.getAttribute('aria-label')?.includes(` · ${t.actual}`)),
        planned: buttons.find((button) => button.getAttribute('aria-label') === `${value.title} · ${t.planned}`),
        forecast: buttons.find((button) => button.getAttribute('aria-label') === `${value.title} · ${t.forecast}`),
        indicators: Array.from(container.querySelectorAll('[data-indicators] button > span'))
    }
}
describe('Gantt execution outcomes', () => {
    it.each(['en', 'zh-Hans'])('preserves independent outcomes across task status changes in %s', (locale) => {
        const t = texts(locale)
        const executions = [
            attempt('failed', 'error', { error: 'Connection lost' }),
            attempt('retry', 'succeeded', { attempt: 2 })
        ]
        let before: string[] | undefined
        for (const status of ['blocked', 'done', 'in_progress'] as const) {
            const { actuals, indicators, planned, forecast } = render({ ...task, status }, executions, locale)
            expect(actuals).toHaveLength(2)
            expect(actuals[0].classList.contains('bg-destructive')).toBe(true)
            expect(actuals[1].classList.contains('bg-[var(--success)]')).toBe(true)
            for (let i = 0; i < actuals.length; i++) {
                const color = Array.from(indicators[i].classList).find((name) => name.startsWith('bg-'))
                expect(actuals[i].classList.contains(color!)).toBe(true)
            }
            expect(actuals[0].title).toContain(t.failed)
            expect(actuals[0].title).toContain('Connection lost')
            expect(actuals[1].getAttribute('aria-label')).toContain(`${t.attempt} 2`)
            expect(actuals[1].title).toContain(t.success)
            const presentation = actuals.map((bar) => `${bar.className}|${bar.title}|${bar.getAttribute('aria-label')}`)
            if (before) expect(presentation).toEqual(before)
            before = presentation
            expect(planned?.classList.contains('bg-muted/60')).toBe(true)
            expect(planned?.classList.contains('border-dashed')).toBe(true)
            expect(forecast?.classList.contains('border-t-2')).toBe(true)
            expect(forecast?.classList.contains('border-destructive')).toBe(true)
        }
        act(() => render({ ...task, status: 'done' }, executions, locale).actuals[1].click())
        expect(select).toHaveBeenCalledWith(expect.objectContaining({ id: task.id }))
    })
    it.each(['en', 'zh-Hans'])('keeps runtime success separate from business rejection/failure in %s', (locale) => {
        const t = texts(locale)
        const { actuals } = render(
            task,
            [
                attempt('rejected', 'success', { status: 'failed', outputSummary: 'rejected' }),
                attempt('business-failed', 'running', { attempt: 2, invocationStatus: 'succeeded', status: 'failed' })
            ],
            locale
        )
        expect(actuals.every((bar) => bar.classList.contains('bg-[var(--success)]'))).toBe(true)
        expect(actuals[0].title).toContain(`${t.outcome}: ${t.rejected}`)
        expect(actuals[1].title).toContain(`${t.outcome}: ${t.failed}`)
        expect(actuals.every((bar) => bar.title.includes(t.success))).toBe(true)
    })
    it.each([
        ['running', 'bg-primary'],
        ['cancelled', 'bg-muted-foreground'],
        ['unknown', 'bg-muted-foreground'],
        ['queued', 'bg-muted-foreground'],
        ['waiting', 'bg-muted-foreground'],
        ['timeout', 'bg-destructive']
    ])('uses deliberate %s styling consistent with indicators', (state, color) => {
        const { actuals, indicators } = render(task, [attempt('execution', state)])
        expect(actuals[0].classList.contains(color)).toBe(true)
        expect(indicators[0].classList.contains(color)).toBe(true)
    })
    it('extends running attempts to now and preserves attempt status fallback', () => {
        const { actuals } = render(task, [
            attempt('running', 'running', { runtimeCompletedAt: null }),
            attempt('legacy-execution', 'failed', { runtimeStatus: undefined, startedAt: start, completedAt: end })
        ])
        expect(actuals[0].style.width).toBe(actuals[1].style.width)
        expect(actuals[1].classList.contains('bg-destructive')).toBe(true)
    })
    it.each(['en', 'zh-Hans'])('keeps task-level legacy ranges neutral and explicitly unknown in %s', (locale) => {
        for (const status of ['blocked', 'done', 'in_progress'] as const) {
            const { actuals } = render({ ...task, status, actualStartAt: start, actualEndAt: end }, [], locale)
            expect(actuals).toHaveLength(1)
            expect(actuals[0].classList.contains('bg-muted-foreground')).toBe(true)
            expect(actuals[0].title).toContain(texts(locale).unknownStatus)
            expect(actuals[0].title).not.toContain(`${texts(locale).attempt} 1`)
        }
    })
})
