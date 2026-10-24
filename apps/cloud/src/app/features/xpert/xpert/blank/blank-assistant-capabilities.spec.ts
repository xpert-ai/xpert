jest.mock('@cloud/app/@core/services/xpert.service', () => ({ XpertAPIService: class {} }))
jest.mock('@cloud/app/@core/services/xpert-template.service', () => ({ XpertTemplateService: class {} }))

import { TestBed } from '@angular/core/testing'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  AssistantCapabilityConfiguration,
  ModelFeature,
  TXpertTeamDraft,
  XpertTemplateSetup
} from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import { XpertAPIService } from '@cloud/app/@core/services/xpert.service'
import { XpertTemplateService } from '@cloud/app/@core/services/xpert-template.service'
import { BlankAssistantCapabilities } from './blank-assistant-capabilities'
import { BlankAssistantCapabilitiesComponent } from './blank-assistant-capabilities.component'

function fixture() {
  const model = { copilotId: 'authorized', model: 'tool-model', modelType: AiModelTypeEnum.LLM }
  const option = {
    key: 'project-tasks',
    label: 'Project management',
    description: 'Manage tasks in a project conversation.',
    supportsQuickCreation: true
  }
  const setup: XpertTemplateSetup = {
    canInstall: true,
    optionalCapabilities: [option],
    requiredModelFeatures: [ModelFeature.TOOL_CALL],
    models: [{ id: 'authorized/tool-model', label: 'Model', copilotModel: model }]
  }
  const configuration: AssistantCapabilityConfiguration = {
    revision: 'revision',
    selected: ['desktop-shell'],
    modelId: 'authorized/tool-model',
    modelAvailable: true,
    options: [{ ...option, required: false, available: true }],
    setup
  }
  const draft: TXpertTeamDraft = { team: { agent: { key: 'primary' } }, nodes: [], connections: [] }
  const templates = { getSetup: jest.fn(() => of(setup)) }
  const assistants = {
    getAssistantCapabilities: jest.fn(() => of(configuration)),
    previewAssistantCapabilities: jest.fn(() => of(draft)),
    saveDraft: jest.fn(() => of(draft))
  }
  TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot(), BlankAssistantCapabilitiesComponent],
    providers: [
      BlankAssistantCapabilities,
      { provide: XpertTemplateService, useValue: templates },
      { provide: XpertAPIService, useValue: assistants }
    ]
  })
  TestBed.inject(TranslateService).use('en')
  return {
    state: TestBed.inject(BlankAssistantCapabilities),
    templates,
    assistants,
    configuration,
    setup,
    model,
    draft
  }
}

describe('Cloud Assistant capability creation', () => {
  it('keeps capabilities off by default and does not change ordinary creation', async () => {
    const { state, assistants, templates } = fixture()
    const xpert = { id: 'assistant' }
    expect(state.enabled()).toBe(false)
    await state.validate(null)
    expect(await state.apply(xpert)).toBe(xpert)
    expect(templates.getSetup).not.toHaveBeenCalled()
    expect(assistants.getAssistantCapabilities).not.toHaveBeenCalled()
  })

  it('requires an authorized tool-calling model before creating an Assistant', async () => {
    const { state, templates, model, setup } = fixture()
    state.selected.set(['project-tasks'])
    await expect(state.validate(null)).rejects.toThrow('ModelRequired')
    await expect(state.validate({ ...model, copilotId: 'other' })).rejects.toThrow('ModelRequired')
    await expect(state.validate(model)).resolves.toBeUndefined()
    expect(templates.getSetup).toHaveBeenLastCalledWith('xpert-blank-assistant', ['project-tasks'])
    setup.canInstall = false
    setup.reason = 'Model access revoked'
    await expect(state.validate(model)).rejects.toThrow('Model access revoked')
  })

  it('saves the server-composed capability with the current revision, retaining other selections', async () => {
    const { state, assistants, draft } = fixture()
    state.selected.set(['project-tasks'])
    expect(await state.apply({ id: 'assistant', title: 'My assistant' })).toEqual({
      id: 'assistant',
      title: 'My assistant',
      draft
    })
    expect(assistants.previewAssistantCapabilities).toHaveBeenCalledWith('assistant', {
      revision: 'revision',
      capabilities: ['desktop-shell', 'project-tasks']
    })
    expect(assistants.saveDraft).toHaveBeenCalledWith('assistant', draft)
  })

  it('discovers plugin capabilities and composes multiple selections without hardcoded keys', async () => {
    const { state, setup, configuration, assistants, templates, model } = fixture()
    const spaces = {
      key: 'spaces',
      label: 'Collaborative space',
      description: 'Shared project documents',
      supportsQuickCreation: true
    }
    setup.optionalCapabilities.push(spaces, {
      key: 'realtime-voice',
      label: 'Voice',
      description: 'Requires configuration'
    })
    configuration.options.push({ ...spaces, required: false, available: true })
    await state.load()
    expect(state.options().map(({ key }) => key)).toEqual(['project-tasks', 'spaces'])
    state.toggle('realtime-voice', true)
    expect(state.selected()).toEqual([])
    state.toggle('spaces', true)
    state.toggle('project-tasks', true)
    state.toggle('spaces', true)
    await state.validate(model)
    expect(templates.getSetup).toHaveBeenLastCalledWith('xpert-blank-assistant', ['spaces', 'project-tasks'])
    await state.apply({ id: 'assistant' })
    expect(assistants.previewAssistantCapabilities).toHaveBeenCalledWith('assistant', {
      revision: 'revision',
      capabilities: ['desktop-shell', 'spaces', 'project-tasks']
    })
    state.toggle('spaces', false)
    expect(state.selected()).toEqual(['project-tasks'])
  })

  it('does not save after availability, permission, revision or model validation fails', async () => {
    const { state, assistants, configuration } = fixture()
    state.selected.set(['project-tasks'])
    configuration.options[0].available = false
    await expect(state.apply({ id: 'assistant' })).rejects.toThrow('Unavailable')
    expect(assistants.previewAssistantCapabilities).not.toHaveBeenCalled()
    configuration.options[0].available = true
    assistants.previewAssistantCapabilities.mockReturnValue(throwError(() => new Error('stale revision')))
    await expect(state.apply({ id: 'assistant' })).rejects.toThrow('stale revision')
    expect(assistants.saveDraft).not.toHaveBeenCalled()
  })

  it('renders a one-click switch with the server label and project-context description', async () => {
    const { state } = fixture()
    const view = TestBed.createComponent(BlankAssistantCapabilitiesComponent)
    view.componentRef.setInput('state', state)
    view.detectChanges()
    await view.whenStable()
    await Promise.resolve()
    await Promise.resolve()
    view.detectChanges()
    const element: HTMLElement = view.nativeElement
    const toggle = element.querySelector<HTMLButtonElement>('button[role="switch"]')
    expect(element.textContent).toContain('Manage tasks in a project conversation.')
    expect(toggle.disabled).toBe(false)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    toggle.click()
    view.detectChanges()
    expect(state.enabled()).toBe(true)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    toggle.click()
    view.detectChanges()
    expect(state.enabled()).toBe(false)
    view.destroy()
  })

  it('hides the section when no quick capabilities are registered', async () => {
    const { state, setup } = fixture()
    setup.optionalCapabilities = []
    await state.load()
    expect(state.options()).toEqual([])
    expect(state.error()).toBeNull()
    expect(state.enabled()).toBe(false)
  })
})
