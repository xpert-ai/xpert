/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PipelineLifecycle } from './lifecycle'
import { changePipelineLifecycle } from './bridge'
import { request } from '../bridge'
import { approvalGraphFixture } from './__fixtures__/approval-graph'
import { pipelineTexts } from './i18n'

jest.mock('../bridge', () => ({ request: jest.fn() }))
jest.mock('@xpert-ai/shadcn-ui', () => {
    const React = jest.requireActual<typeof import('react')>('react')
    const Open = React.createContext(false)
    const box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
    return {
        Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (
            <Open.Provider value={open}>{children}</Open.Provider>
        ),
        DialogTrigger: ({ children }: { children: React.ReactNode }) => children,
        DialogContent: ({ children }: { children: React.ReactNode }) =>
            React.useContext(Open) ? <section role="dialog">{children}</section> : null,
        DialogHeader: box,
        DialogFooter: box,
        DialogTitle: box,
        DialogDescription: box,
        Button: ({ children, onClick, disabled }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
            <button onClick={onClick} disabled={disabled}>
                {children}
            </button>
        )
    }
})

const call = jest.mocked(request)
const texts = pipelineTexts('en')
const graph = () => ({
    ...approvalGraphFixture(),
    instance: {
        id: '33333333-3333-4333-8333-333333333333',
        revision: 2,
        title: 'Pipeline',
        authority: 'platform' as const,
        ownerRef: 'platform',
        sourceKey: 'test',
        updatedAt: '2026-11-24T00:00:00Z'
    },
    round: { sequence: 1, generation: 1, state: 'active', inputDigest: 'a'.repeat(64) },
    runId: '11111111-1111-4111-8111-111111111111',
    actions: { cancel: true, retries: [] },
    permissions: { canEdit: true, canManage: true }
})
let container: HTMLDivElement, root: ReturnType<typeof createRoot>
beforeAll(() => Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }))
beforeEach(() => {
    call.mockReset().mockResolvedValue({ success: true, data: { revision: 5 } })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})
afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
})
const click = async (selector: string) => {
    const button = container.querySelector<HTMLButtonElement>(selector)
    expect(button).not.toBeNull()
    await act(async () => button!.click())
}

it('sends runId without a revision for cancel and retains the versioned retry contract', async () => {
    const target = graph()
    await changePipelineLifecycle(target, 'request')
    expect(call).toHaveBeenLastCalledWith('executeAction', {
        actionKey: 'pipeline-cancel',
        input: { instanceId: target.instance.id, runId: target.runId, requestId: 'request' }
    })
    await changePipelineLifecycle(target, 'retry-request', 'operation')
    expect(call).toHaveBeenLastCalledWith('executeAction', {
        actionKey: 'pipeline-retry',
        input: {
            instanceId: target.instance.id,
            requestId: 'retry-request',
            expectedRevision: target.instance.revision,
            operationId: 'operation',
            inputDigest: target.round.inputDigest,
            generation: target.round.generation
        }
    })
})

it('keeps the confirmation target on the original run when polling displays a new run', async () => {
    const original = graph(),
        reload = jest.fn().mockResolvedValue(undefined)
    await act(async () => root.render(<PipelineLifecycle graph={original} t={texts} reload={reload} />))
    await click('button')
    const newer = {
        ...original,
        runId: '22222222-2222-4222-8222-222222222222',
        instance: { ...original.instance, revision: 30 }
    }
    await act(async () => root.render(<PipelineLifecycle graph={newer} t={texts} reload={reload} />))
    await click('[role="dialog"] button:last-child')
    expect(call.mock.calls[0][1]).toMatchObject({ input: { runId: original.runId } })
    expect(reload).toHaveBeenCalledTimes(1)
})

it('reuses the cancellation request after a transport error despite same-run progress', async () => {
    const original = graph(),
        reload = jest.fn().mockResolvedValue(undefined)
    call.mockRejectedValueOnce(new Error('Response lost'))
    await act(async () => root.render(<PipelineLifecycle graph={original} t={texts} reload={reload} />))
    await click('button')
    await click('[role="dialog"] button:last-child')
    const newer = { ...original, instance: { ...original.instance, revision: 40 } }
    await act(async () => root.render(<PipelineLifecycle graph={newer} t={texts} reload={reload} />))
    await click('[role="dialog"] button:last-child')
    expect(call.mock.calls[1]).toEqual(call.mock.calls[0])
    expect(reload).toHaveBeenCalledTimes(1)
})
