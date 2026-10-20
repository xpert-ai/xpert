/** @jest-environment jsdom */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { PipelineConfiguration } from './configuration'
import { request } from '../bridge'

jest.mock('../bridge', () => ({ request: jest.fn() }))
jest.mock('./runtime-configuration', () => ({ RuntimeConfiguration: () => null }))
jest.mock('./budget-configuration', () => ({ BudgetConfiguration: () => null }))
jest.mock('@xpert-ai/shadcn-ui', () => {
    const React = jest.requireActual<typeof import('react')>('react')
    const box = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
    return {
        Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
            React.createElement('button', props, children),
        Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
            open ? React.createElement('section', { role: 'dialog' }, children) : null,
        DialogContent: box,
        DialogTitle: box,
        DialogDescription: box,
        Select: () => null,
        SelectTrigger: box,
        SelectContent: box,
        SelectValue: box,
        SelectItem: box
    }
})
it('opens only on explicit configuration intent and stays closed after dismissal and rerender', async () => {
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.mocked(request).mockImplementation(async (_method, args) => ({
        success: true,
        data:
            args.actionKey === 'pipeline-catalog'
                ? { canManage: true, items: [], assistants: [] }
                : { items: [], next: null }
    }))
    const container = document.createElement('div'),
        root = createRoot(container)
    try {
        await act(async () => root.render(React.createElement(PipelineConfiguration, { locale: 'zh-Hans' })))
        expect(container.querySelector('[role=dialog]')).toBeNull()
        await act(async () => container.querySelector<HTMLButtonElement>('button')!.click())
        expect(container.querySelector('[role=dialog]')).not.toBeNull()
        await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="关闭"]')!.click())
        await act(async () => root.render(React.createElement(PipelineConfiguration, { locale: 'en-US' })))
        expect(container.querySelector('[role=dialog]')).toBeNull()
        expect(jest.mocked(request).mock.calls.every(([, args]) => args.actionKey !== 'pipeline-configure')).toBe(true)
    } finally {
        await act(async () => root.unmount())
        errors.mockRestore()
    }
})
