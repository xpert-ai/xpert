/** @jest-environment jsdom */
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { OperationActions } from './operation-actions'
import { readOperationActions, submitOperationAction } from './bridge'
import { approvalGraphFixture } from './__fixtures__/approval-graph'
import { pipelineTexts } from './i18n'
jest.mock('./bridge', () => ({ readOperationActions: jest.fn(), submitOperationAction: jest.fn() }))
jest.mock('../view-visibility', () => ({ useViewVisible: () => true }))
jest.mock('@xpert-ai/shadcn-ui', () => ({
    Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props} />
}))

it('requires confirmation of the displayed version, submits once and removes the handled action', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    const graph = {
        ...approvalGraphFixture(),
        instance: {
            id: 'pipeline',
            title: 'Pipeline',
            authority: 'platform' as const,
            ownerRef: 'platform',
            sourceKey: 'test',
            revision: 1,
            updatedAt: new Date().toISOString()
        }
    }
    const operationId = '11111111-1111-4111-8111-111111111111'
    const read = jest.mocked(readOperationActions),
        submit = jest.mocked(submitOperationAction)
    read.mockResolvedValue({
        operationId,
        messages: [{ en_US: 'Exact archive approval' }],
        items: [
            {
                key: 'authorize',
                version: 'digest',
                title: { en_US: 'Authorize installation' },
                confirmation: { en_US: 'Install this exact archive; allow restart' }
            }
        ]
    })
    submit.mockImplementation(async () => {
        read.mockResolvedValue({ operationId, messages: [{ en_US: 'Authorized' }], items: [] })
        return { accepted: true }
    })
    const container = document.createElement('div'),
        root = createRoot(container),
        reload = jest.fn()
    document.body.appendChild(container)
    try {
        await act(async () =>
            root.render(
                <OperationActions
                    graph={graph}
                    node={graph.nodes[0]}
                    locale="en"
                    t={pipelineTexts('en')}
                    reload={reload}
                />
            )
        )
        expect(container.querySelector('button')?.disabled).toBe(true)
        await act(async () => container.querySelector<HTMLInputElement>('input')!.click())
        expect(container.querySelector('button')?.disabled).toBe(false)
        await act(async () => container.querySelector('button')!.click())
        expect(submit).toHaveBeenCalledTimes(1)
        expect(submit).toHaveBeenCalledWith({ operationId, key: 'authorize', version: 'digest' })
        expect(container.querySelector('button')).toBeNull()
        expect(container.textContent).toContain('Authorized')
        expect(reload).toHaveBeenCalledTimes(1)
    } finally {
        await act(async () => root.unmount())
        container.remove()
    }
})
