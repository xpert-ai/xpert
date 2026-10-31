import { DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  AiProviderRole,
  DEFAULT_MODEL_DEFINITIONS,
  ParameterRule,
  RoleDefaultSetting
} from '@xpert-ai/contracts'
import { of, Subject } from 'rxjs'
import { CopilotProviderService, CopilotServerService, Store } from '../../../../@core'
import { DefaultModelsDialogComponent } from './defaults.component'

describe('default model settings', () => {
  function setup() {
    const server = {
      getRoleDefaults: jest.fn().mockReturnValue(of([])),
      getManagementCopilotModels: jest
        .fn()
        .mockReturnValue(of([{ id: 'connection', modelProvider: { id: 'provider' } }]))
    }
    const providers = { getModelParameterRules: jest.fn().mockReturnValue(of([])) }
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: CopilotServerService, useValue: server },
        { provide: CopilotProviderService, useValue: providers },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: Store, useValue: { selectOrganizationId: () => of('org') } }
      ]
    })
    return { component: TestBed.runInInjectionContext(() => new DefaultModelsDialogComponent()), providers }
  }
  const row = (role: RoleDefaultSetting['role'], modelType: AiModelTypeEnum): RoleDefaultSetting => ({
    role,
    mode: 'fixed',
    available: true,
    sourceOrganizationId: 'org',
    binding: { copilotId: 'connection', model: role, modelType }
  })
  afterEach(() => TestBed.resetTestingModule())

  it('keeps all eleven selectors constrained to their real types', async () => {
    const { component } = setup()
    await component.load()
    component.settings.set(DEFAULT_MODEL_DEFINITIONS.map((definition) => row(definition.role, definition.modelType)))
    expect(component.settings().map((item) => component.type(item.role))).toEqual([
      AiModelTypeEnum.LLM,
      AiModelTypeEnum.LLM,
      AiModelTypeEnum.LLM,
      AiModelTypeEnum.TEXT_EMBEDDING,
      AiModelTypeEnum.REALTIME,
      AiModelTypeEnum.TTS,
      AiModelTypeEnum.SPEECH2TEXT,
      AiModelTypeEnum.IMAGE,
      AiModelTypeEnum.VIDEO,
      AiModelTypeEnum.RERANK,
      AiModelTypeEnum.MODERATION
    ])
  })

  it('ignores late parameter rules after another default is opened', async () => {
    const { component, providers } = setup()
    const earlier = new Subject<ParameterRule[]>()
    providers.getModelParameterRules.mockReturnValueOnce(earlier)
    const pending = component.editParameters(row(AiProviderRole.Primary, AiModelTypeEnum.LLM))
    await Promise.resolve()
    const currentRules = [{ name: 'voice', type: 'string', required: false }] as ParameterRule[]
    providers.getModelParameterRules.mockReturnValueOnce(of(currentRules))
    await component.editParameters(row(AiModelTypeEnum.TTS, AiModelTypeEnum.TTS))
    earlier.next([{ name: 'temperature', type: 'float', required: false }] as ParameterRule[])
    await pending
    expect(component.rules()).toEqual(currentRules)
    expect(component.parameterModel()?.modelType).toBe(AiModelTypeEnum.TTS)
    expect(component.parametersLoading()).toBe(false)
  })

  it('discards an error returned after leaving the parameter step', async () => {
    const { component, providers } = setup()
    const response = new Subject<ParameterRule[]>()
    providers.getModelParameterRules.mockReturnValueOnce(response)
    const pending = component.editParameters(row(AiProviderRole.Primary, AiModelTypeEnum.LLM))
    await Promise.resolve()
    component.cancelParameters()
    response.error(new Error('Request failed'))
    await pending
    expect(component.editingRole()).toBeNull()
    expect(component.parameterError()).toBe('')
    expect(component.rules()).toEqual([])
  })
})
