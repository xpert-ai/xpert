import { signal, createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import type { AssistantCapabilityConfiguration, TXpertTeamDraft } from '@xpert-ai/contracts'
import { of, Subject, throwError } from 'rxjs'
import { XpertAPIService } from '@cloud/app/@core/services/xpert.service'
import { XpertSettingsEditor } from './xpert-settings.editor'
import { createXpertSettingsForm } from './xpert-settings.form'
import { SettingsAssistantCapabilitiesComponent } from './settings-assistant-capabilities.component'

jest.mock('./settings-capabilities.component', () => ({ SettingsCapabilitiesComponent: class {} }))

jest.mock('@cloud/app/@core/services/xpert.service', () => ({ XpertAPIService: class {} }))

function fixture() {
  const draft = signal<TXpertTeamDraft>({
    team: { id: 'assistant', agent: { key: 'primary' }, options: { messagePresentation: { mode: 'bubbles' } } },
    nodes: [{ key: 'primary', type: 'agent', position: { x: 0, y: 0 }, entity: { key: 'primary', prompt: 'Keep' } }],
    connections: []
  })
  const unsaved = signal(false)
  const source = {
    id: 'assistant',
    draft,
    unsaved,
    saving: signal(false),
    save: jest.fn(async () => {
      unsaved.set(false)
    }),
    update: jest.fn((change: (value: TXpertTeamDraft) => TXpertTeamDraft) => {
      draft.update(change)
      unsaved.set(true)
    })
  }
  const configuration: AssistantCapabilityConfiguration = {
    revision: 'a'.repeat(64),
    selected: [],
    options: [
      {
        key: 'sandbox-tools',
        label: 'Sandbox',
        description: '',
        required: false,
        available: true
      }
    ],
    modelId: '',
    modelAvailable: true,
    setup: { optionalCapabilities: [], requiredModelFeatures: [], models: [], canInstall: true }
  }
  const result: TXpertTeamDraft = structuredClone(draft())
  result.team.options.assistantCapabilities = {
    version: 1,
    selected: ['desktop-shell'],
    agentKey: 'primary',
    instructions: '',
    nodes: [],
    connections: []
  }
  const api = {
    getAssistantCapabilities: jest.fn(() => of(configuration)),
    previewAssistantCapabilities: jest.fn(() => of(result))
  }
  const form = createXpertSettingsForm(draft().team)
  const revision = signal(0)
  form.valueChanges.subscribe(() => revision.update((value) => value + 1))
  const editor = {
    source,
    form,
    revision,
    confirmDiscard: signal(false),
    composing: signal(false),
    publishing: signal(false),
    invalidSections: signal([]),
    syncCapabilityRuntime: jest.fn(() =>
      form.controls.runtime.reset(createXpertSettingsForm(draft().team).controls.runtime.getRawValue())
    ),
    save: jest.fn(async () => {
      if (unsaved()) await source.save()
      return true
    })
  }
  TestBed.configureTestingModule({
    providers: [
      { provide: XpertSettingsEditor, useValue: editor },
      { provide: XpertAPIService, useValue: api },
      { provide: TranslateService, useValue: { instant: (key: string) => key } }
    ]
  })
  const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector))
  const component = runInInjectionContext(injector, () => new SettingsAssistantCapabilitiesComponent())
  return { component, editor, api, source, draft, configuration, result, injector }
}

describe('Assistant capability settings', () => {
  it('keeps toggles and provider choices local across refreshes until explicit save', async () => {
    const { component, editor, source, api, result } = fixture()
    source.unsaved.set(true)
    await component.load()
    expect(source.save).not.toHaveBeenCalled()
    expect(component.sandboxEnabled()).toBe(false)
    component.toggle('sandbox-tools', true)
    component.provider.setValue('sandbox-b')
    expect(component.sandboxEnabled()).toBe(true)
    expect(component.dirty()).toBe(true)
    expect(api.previewAssistantCapabilities).not.toHaveBeenCalled()
    expect(source.save).not.toHaveBeenCalled()
    await component.load()
    expect(component.selected()).toEqual(['sandbox-tools'])
    expect(component.provider.value).toBe('sandbox-b')
    component.toggle('sandbox-tools', false)
    expect(component.sandboxEnabled()).toBe(false)
    component.toggle('sandbox-tools', true)
    result.team.features = { sandbox: { enabled: true, provider: 'sandbox-b' } }
    expect(await component.save()).toBe(true)
    expect(api.previewAssistantCapabilities).toHaveBeenCalledWith('assistant', {
      revision: 'a'.repeat(64),
      capabilities: ['sandbox-tools'],
      sandboxProvider: 'sandbox-b'
    })
    expect(component.dirty()).toBe(false)
  })

  it('resets without network writes', async () => {
    const { component, api, source } = fixture()
    await component.load()
    component.toggle('sandbox-tools', true)
    component.provider.setValue('sandbox-b')
    component.reset()
    expect(component.sandboxEnabled()).toBe(false)
    expect(component.provider.value).toBe('')
    expect(component.dirty()).toBe(false)
    expect(source.save).not.toHaveBeenCalled()
    expect(api.previewAssistantCapabilities).not.toHaveBeenCalled()
  })

  it('opens read-only, then applies a validated result through the shared draft queue without publishing', async () => {
    const { component, source, api, draft, editor } = fixture()
    await component.load()
    expect(source.save).not.toHaveBeenCalled()
    component.selected.set(['desktop-shell'])
    expect(await component.save()).toBe(true)
    expect(source.save).toHaveBeenCalledTimes(1)
    expect(api.previewAssistantCapabilities).toHaveBeenCalledWith('assistant', {
      revision: 'a'.repeat(64),
      capabilities: ['desktop-shell']
    })
    expect(draft().team.options.assistantCapabilities.selected).toEqual(['desktop-shell'])
    expect(draft().team.options.messagePresentation.mode).toBe('bubbles')
    expect(editor.syncCapabilityRuntime).toHaveBeenCalled()
    expect(component.dirty()).toBe(false)
    expect(editor.composing()).toBe(false)
  })

  it('keeps invalid capability changes pending so publication cannot silently ignore them', async () => {
    const { component, configuration, api, source } = fixture()
    api.previewAssistantCapabilities.mockReturnValue(throwError(() => new Error('Sandbox unavailable')))
    component.selected.set(['sandbox-tools'])
    expect(await component.save()).toBe(false)
    expect(component.error()).toBe('Sandbox unavailable')
    expect(component.dirty()).toBe(true)
    expect(api.previewAssistantCapabilities).toHaveBeenCalled()
    expect(source.update).not.toHaveBeenCalled()
  })

  it('blocks unsupported models and lets the user retry after changing model settings', async () => {
    const { component, configuration, api } = fixture()
    api.previewAssistantCapabilities.mockReturnValueOnce(throwError(() => new Error('Model required')))
    component.selected.set(['desktop-shell'])
    expect(await component.save()).toBe(false)
    expect(api.previewAssistantCapabilities).toHaveBeenCalled()
    configuration.modelAvailable = true
    expect(await component.save()).toBe(true)
  })

  it('revalidates a later model change before publication even after the capability draft was saved', async () => {
    const { component, configuration, api } = fixture()
    component.selected.set(['desktop-shell'])
    expect(await component.save()).toBe(true)
    api.previewAssistantCapabilities.mockReturnValueOnce(throwError(() => new Error('Model required')))
    expect(await component.preparePublish()).toBe(false)
    configuration.modelAvailable = true
    expect({ saved: await component.preparePublish(), error: component.error() }).toEqual({ saved: true, error: null })
  })

  it('rejects a response that would overwrite newer local edits', async () => {
    const { component, api, draft, result, source, editor } = fixture()
    const response = new Subject<TXpertTeamDraft>()
    let previewStarted!: () => void
    const started = new Promise<void>((resolve) => {
      previewStarted = resolve
    })
    api.previewAssistantCapabilities.mockImplementation(() => {
      previewStarted()
      return response
    })
    component.selected.set(['desktop-shell'])
    const pending = component.save()
    await started
    expect(editor.composing()).toBe(true)
    draft.update((value) => ({ ...value, team: { ...value.team, title: 'Newer edit' } }))
    response.next(result)
    response.complete()
    expect(await pending).toBe(false)
    expect(source.update).not.toHaveBeenCalled()
    expect(draft().team.title).toBe('Newer edit')
    expect(component.dirty()).toBe(true)
  })

  it('does not apply a response after its organization-bound dialog has been destroyed', async () => {
    const { component, api, result, source, injector } = fixture()
    const response = new Subject<TXpertTeamDraft>()
    let previewStarted!: () => void
    const started = new Promise<void>((resolve) => {
      previewStarted = resolve
    })
    api.previewAssistantCapabilities.mockImplementation(() => {
      previewStarted()
      return response
    })
    component.selected.set(['desktop-shell'])
    const pending = component.save()
    await started
    injector.destroy()
    response.next(result)
    response.complete()
    expect(await pending).toBe(false)
    expect(source.update).not.toHaveBeenCalled()
  })
})
