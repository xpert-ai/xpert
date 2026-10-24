/** @jest-environment jsdom */
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { serialize, deserialize } from 'node:v8'
import { projectPipelineCatalogSchema, type ProjectPipelineCatalog } from '@xpert-ai/contracts'
import { PipelineConfiguration } from './configuration'
import { ProviderTemplateDialog } from './provider-template'
import { request } from '../bridge'
import { summarySchema } from './bridge'

jest.mock('../bridge', () => ({ request: jest.fn() }))
jest.mock('./runtime-configuration', () => ({ RuntimeConfiguration: () => null }))
jest.mock('./budget-configuration', () => ({ BudgetConfiguration: () => null }))
jest.mock('@xpert-ai/shadcn-ui', () => {
    const React = jest.requireActual<typeof import('react')>('react')
    const box = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
    const DialogContext = React.createContext(false)
    return {
        Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
            React.createElement('button', props, children),
        Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => React.createElement('input', props),
        Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
            React.createElement(DialogContext.Provider, { value: open }, children),
        DialogTrigger: box,
        DialogContent: ({ children }: { children?: React.ReactNode }) =>
            React.useContext(DialogContext) ? React.createElement('section', { role: 'dialog' }, children) : null,
        DialogHeader: box,
        DialogFooter: box,
        DialogClose: box,
        Label: (props: React.LabelHTMLAttributes<HTMLLabelElement>) => React.createElement('label', props),
        Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => React.createElement('textarea', props),
        Checkbox: ({
            onCheckedChange,
            ...props
        }: React.InputHTMLAttributes<HTMLInputElement> & { onCheckedChange: (checked: boolean) => void }) =>
            React.createElement('input', {
                ...props,
                type: 'checkbox',
                onChange: (event: React.ChangeEvent<HTMLInputElement>) => onCheckedChange(event.target.checked)
            }),
        DialogTitle: box,
        DialogDescription: box,
        Select: ({
            onValueChange,
            children,
            ...props
        }: React.SelectHTMLAttributes<HTMLSelectElement> & { onValueChange: (value: string) => void }) =>
            React.createElement(
                'select',
                {
                    ...props,
                    onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onValueChange(event.target.value)
                },
                React.createElement('option', { value: '' }),
                children
            ),
        SelectTrigger: () => null,
        SelectValue: () => null,
        SelectContent: ({ children }: { children: React.ReactNode }) =>
            React.createElement(React.Fragment, null, children),
        SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) =>
            React.createElement('option', { value }, children)
    }
})

const { createPipelineConfigurationPreview, createPipelinePreview } = require('../../pipeline.preview.mjs')
// jsdom omits Node's structuredClone; the shared preview fixture uses it for plain data.
Object.defineProperty(window, 'structuredClone', {
    configurable: true,
    value: (value: unknown) => deserialize(serialize(value))
})
const projectId = '37b93e60-5d40-4776-9928-05e9bb4acaf5'
const restricted = { allowed: false, reason: 'PIPELINE_SCOPED_DELEGATION_UNAVAILABLE' } as const
let catalog: ProjectPipelineCatalog, container: HTMLDivElement, root: Root
let failSave = false,
    failNavigation = false
let errors: jest.SpyInstance
const button = (label: string) =>
    Array.from(container.querySelectorAll('button')).find((item) => item.textContent === label)!
beforeEach(() => {
    errors = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    jest.mocked(request).mockReset()
    const previous = process.env.TASKS_PREVIEW_SCENARIO
    process.env.TASKS_PREVIEW_SCENARIO = 'pipeline-managed'
    catalog = projectPipelineCatalogSchema.parse(createPipelineConfigurationPreview())
    if (previous === undefined) delete process.env.TASKS_PREVIEW_SCENARIO
    else process.env.TASKS_PREVIEW_SCENARIO = previous
    failSave = failNavigation = false
    jest.mocked(request).mockImplementation(async (method, args: { actionKey?: string }) => {
        if (method === 'invokeClientCommand') return { success: !failNavigation }
        if (args.actionKey === 'pipeline-catalog') return { success: true, data: catalog }
        if (args && 'actionKey' in args && args.actionKey === 'pipeline-configure') {
            if (failSave) {
                catalog = { ...catalog, commandCapability: restricted }
                throw Error('Request rejected')
            }
            return { success: true, data: { bindingId: projectId, revision: 1 } }
        }
        return { success: true, data: { items: [], next: null } }
    })
    container = document.createElement('div')
    root = createRoot(container)
})
afterEach(async () => {
    await act(async () => root.unmount())
    errors.mockRestore()
})
const mount = async () =>
    act(async () =>
        root.render(React.createElement(PipelineConfiguration, { locale: 'zh-Hans', projectId, initialOpen: true }))
    )
const select = async (element: HTMLSelectElement, value: string) =>
    act(async () => {
        element.value = value
        element.dispatchEvent(new Event('change', { bubbles: true }))
    })
async function fill() {
    await mount()
    const item = catalog.items[0]
    await select(
        container.querySelector('select')!,
        JSON.stringify([item.contributionKey, item.configuration.binding.templateRef])
    )
    await select(container.querySelectorAll('select')[1], catalog.assistants[0].id)
    expect(button('保存配置').disabled).toBe(false)
}

it('explains a scoped session before input and navigates only to the current Project management target', async () => {
    catalog.commandCapability = restricted
    await mount()
    expect(container.textContent).toContain('不支持保存配置或执行流水线操作')
    expect(container.querySelector('select')!.disabled).toBe(true)
    await act(async () => button('打开项目流水线管理').click())
    expect(request).toHaveBeenLastCalledWith('invokeClientCommand', {
        commandKey: 'workbench.navigation.open',
        payload: { target: 'project.pipelines', projectId }
    })
    expect(
        jest
            .mocked(request)
            .mock.calls.some(([, args]) => args && 'actionKey' in args && args.actionKey === 'pipeline-configure')
    ).toBe(false)
})
it('keeps the dialog usable and explains a rejected management navigation', async () => {
    catalog.commandCapability = restricted
    failNavigation = true
    await mount()
    await act(async () => button('打开项目流水线管理').click())
    expect(container.querySelector('[role=alert]')?.textContent).toContain('无法打开项目管理页面')
    expect(container.querySelector('[role=dialog]')).not.toBeNull()
    expect(button('打开项目流水线管理').disabled).toBe(false)
})
it('does not infer command access from Project management rights when capability metadata is missing', async () => {
    delete catalog.commandCapability
    await mount()
    expect(container.textContent).toContain('尚未确认当前会话')
    expect(container.querySelector('select')!.disabled).toBe(true)
})
it('allows a confirmed user session to save and reports success only after the binding receipt', async () => {
    await fill()
    expect(container.textContent).not.toContain('配置已保存')
    await act(async () => button('保存配置').click())
    expect(container.textContent).toContain('配置已保存')
    expect(
        jest
            .mocked(request)
            .mock.calls.filter(([, args]) => args && 'actionKey' in args && args.actionKey === 'pipeline-configure')
    ).toHaveLength(1)
})
it('preserves the entered configuration and offers recovery when the credential changes before saving', async () => {
    await fill()
    const selected = Array.from(container.querySelectorAll('select')).map((element) => element.value)
    failSave = true
    await act(async () => button('保存配置').click())
    expect(container.textContent).toContain('不支持保存配置或执行流水线操作')
    expect(container.textContent).not.toContain('配置已保存')
    expect(Array.from(container.querySelectorAll('select')).map((element) => element.value)).toEqual(selected)
    expect(button('保存配置').disabled).toBe(true)
    expect(button('打开项目流水线管理')).toBeDefined()
})

async function mountProvider() {
    const previous = process.env.TASKS_PREVIEW_SCENARIO
    process.env.TASKS_PREVIEW_SCENARIO = 'pipeline'
    catalog = projectPipelineCatalogSchema.parse(createPipelineConfigurationPreview())
    const graph = {
        definition: { ...catalog.items[0].configuration.template },
        instance: summarySchema.parse(createPipelinePreview().instance)
    }
    if (previous === undefined) delete process.env.TASKS_PREVIEW_SCENARIO
    else process.env.TASKS_PREVIEW_SCENARIO = previous
    graph.definition.title = '汽车工程流程（已绑定）'
    graph.definition.version = '1.0.0'
    catalog.items[0].configuration.template.version = '2.0.0'
    catalog.items[0].configuration.binding.templateRef = `${graph.definition.key}@2.0.0`
    catalog.commandCapability = restricted
    await act(async () =>
        root.render(
            React.createElement(ProviderTemplateDialog, {
                locale: 'zh-Hans',
                projectId,
                initialOpen: true,
                pipeline: graph
            })
        )
    )
    return graph
}

it('shows only the persisted provider template and management entry, without configuration controls or catalog requests', async () => {
    await mountProvider()
    const current = container.querySelector('[aria-label="当前绑定模板"]')!
    expect(current.textContent).toContain('汽车工程流程（已绑定）')
    expect(current.textContent).toContain('1.0.0')
    expect(container.querySelector('select')).toBeNull()
    expect(button('配置流水线')).toBeUndefined()
    expect(button('保存配置')).toBeUndefined()
    expect(request).not.toHaveBeenCalled()
})

it('hides the configuration entry for provider-only project catalogs even without a loaded instance', async () => {
    await mountProvider()
    await mount()
    expect(button('配置流水线')).toBeUndefined()
    expect(container.querySelector('select')).toBeNull()
})

it('opens the provider workbench using the exact instance and host-authorized project target', async () => {
    const graph = await mountProvider()
    jest.mocked(request).mockResolvedValueOnce({
        success: true,
        data: {
            target: 'workbench.view',
            projectId,
            xpertId: 'automotive-assistant',
            viewKey: 'automotive.case',
            selectionId: 'CASE-001'
        }
    })
    await act(async () => button('打开业务工作台').click())
    expect(request).toHaveBeenCalledWith('executeAction', {
        actionKey: 'workspace-target',
        input: { instanceId: graph.instance.id }
    })
    expect(request).toHaveBeenCalledWith('invokeClientCommand', {
        commandKey: 'workbench.navigation.open',
        payload: {
            target: 'workbench.view',
            projectId,
            xpertId: 'automotive-assistant',
            viewKey: 'automotive.case',
            selectionId: 'CASE-001'
        }
    })
    expect(container.querySelector('[role=dialog]')).toBeNull()
})

it('keeps the binding and dialog when the host rejects a provider management target', async () => {
    await mountProvider()
    jest.mocked(request).mockRejectedValueOnce(new Error('Access denied'))
    await act(async () => button('打开业务工作台').click())
    expect(container.querySelector('[role=alert]')).not.toBeNull()
    expect(container.querySelector('[aria-label="当前绑定模板"]')).not.toBeNull()
    expect(button('打开业务工作台').disabled).toBe(false)
    expect(jest.mocked(request).mock.calls.some(([method]) => method === 'invokeClientCommand')).toBe(false)
})
