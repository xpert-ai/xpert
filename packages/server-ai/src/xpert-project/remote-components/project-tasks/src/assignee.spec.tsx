import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Assignee } from './assignee'
import { texts } from './i18n'
import { owner, type Attempt } from './model'
import type { Node } from './bridge'

jest.mock('@xpert-ai/shadcn-ui', () => ({ cn: (...values: string[]) => values.filter(Boolean).join(' ') }))
jest.mock('./execution-indicators', () => ({ ExecutionIndicators: () => <span>execution-indicators</span> }))

const task: Node = {
    id: 'task',
    title: 'Historical task',
    status: 'todo',
    kind: 'task',
    parentTaskId: null,
    predecessorIds: [],
    providerKey: null,
    sourceKey: null,
    revision: 1,
    plannedStartAt: null,
    plannedEndAt: null,
    estimatedDurationMs: null,
    actualStartAt: null,
    actualEndAt: null,
    diagnostic: null,
    assigneeXpertId: null
}

describe('responsible Assistant presentation', () => {
    it.each(['en', 'zh-Hans'])(
        'keeps list and detail ownership consistent in %s despite a Codex execution',
        (locale) => {
            const t = texts(locale)
            const attempts = [
                {
                    id: 'attempt',
                    taskId: task.id,
                    attempt: 7,
                    status: 'failed',
                    invocationId: 'invocation',
                    runtimeProvider: 'codex-computer'
                }
            ] as Attempt[]
            const render = (value: Node) =>
                renderToStaticMarkup(
                    <Assignee task={value} attempts={attempts} t={t} locale={locale} onError={() => undefined} />
                )
            expect(render(task)).toContain(owner(task, t.unassigned, t.unnamedAssistant))
            expect(render(task)).toContain(t.unassigned)
            expect(render(task)).not.toContain('Codex')
            expect(render(task)).toContain('execution-indicators')
            const assigned = { ...task, assigneeXpertId: 'member', assigneeName: 'Responsible Assistant' }
            expect(render(assigned)).toContain(owner(assigned, t.unassigned, t.unnamedAssistant))
            expect(render(assigned)).not.toContain(t.unassigned)
        }
    )
})
