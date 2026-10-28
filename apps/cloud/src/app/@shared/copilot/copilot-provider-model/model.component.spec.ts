import { TestBed } from '@angular/core/testing'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, defaultModelConfiguration, ICopilotProviderModel } from '@xpert-ai/contracts'
import { of, Subject } from 'rxjs'
import { CopilotProviderService } from '../../../@core/services/copilot-provider.service'
import { ToastrService } from '../../../@core'
import { CopilotProviderModelComponent } from './model.component'

describe('editing imported model configuration', () => {
  afterEach(() => TestBed.resetTestingModule())

  it.each([AiModelTypeEnum.TEXT_EMBEDDING, AiModelTypeEnum.RERANK])(
    'selects the persisted %s type after async loading, independent of focus',
    async (type) => {
      const response = new Subject<unknown>()
      await TestBed.configureTestingModule({
        imports: [CopilotProviderModelComponent, NoopAnimationsModule, TranslateModule.forRoot()],
        providers: [
          {
            provide: DIALOG_DATA,
            useValue: {
              modelId: 'saved',
              provider: {
                id: 'provider',
                provider: {
                  label: { en_US: 'Xirang' },
                  supported_model_types: [AiModelTypeEnum.LLM, AiModelTypeEnum.TEXT_EMBEDDING, AiModelTypeEnum.RERANK],
                  model_credential_schema: {
                    model: { label: { en_US: 'Model' }, placeholder: {} },
                    credential_form_schemas: []
                  }
                }
              }
            }
          },
          { provide: DialogRef, useValue: { close: jest.fn() } },
          { provide: CopilotProviderService, useValue: { getModel: () => response } },
          { provide: ToastrService, useValue: {} }
        ]
      }).compileComponents()
      const fixture = TestBed.createComponent(CopilotProviderModelComponent)
      fixture.detectChanges()
      await fixture.whenStable()
      expect(fixture.componentInstance.modelTypes()).toEqual([])
      response.next({
        id: 'saved',
        modelName: 'model',
        modelType: type,
        modelProperties: { model_configuration: defaultModelConfiguration(type) }
      })
      fixture.detectChanges()
      await fixture.whenStable()
      fixture.detectChanges()
      const choices: HTMLElement[] = Array.from(
        fixture.nativeElement.querySelectorAll('[role="option"], input[type="radio"]')
      )
      const visiblySelected = () =>
        choices.findIndex((choice) =>
          choice instanceof HTMLInputElement ? choice.checked : choice.classList.contains('cdk-option-active')
        )
      expect(visiblySelected()).toBe(type === AiModelTypeEnum.TEXT_EMBEDDING ? 1 : 2)
      choices[0].focus()
      expect(visiblySelected()).toBe(type === AiModelTypeEnum.TEXT_EMBEDDING ? 1 : 2)
      expect(fixture.componentInstance.configuration()?.modelType).toBe(type)
      await fixture.whenStable()
      fixture.destroy()
    }
  )

  it('initializes manual overrides from saved values, then YAML, then defaults without resetting edits', async () => {
    const builtin = {
      model: 'known',
      model_type: AiModelTypeEnum.LLM,
      model_properties: { context_size: 64000 },
      parameter_rules: [{ name: 'max_tokens', max: 8192, default: 4096 }]
    }
    const saved = {
      modelName: 'saved',
      modelType: AiModelTypeEnum.LLM,
      modelProperties: {
        model_configuration: { ...defaultModelConfiguration(AiModelTypeEnum.LLM), contextSize: 32000 }
      }
    }
    await TestBed.configureTestingModule({
      imports: [CopilotProviderModelComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: {
            catalog: { discoverySupported: true, builtin: [builtin], custom: [saved] },
            provider: {
              id: 'provider',
              provider: {
                label: {},
                supported_model_types: [AiModelTypeEnum.LLM, AiModelTypeEnum.TEXT_EMBEDDING],
                model_credential_schema: { model: { label: {}, placeholder: {} }, credential_form_schemas: [] }
              }
            }
          }
        },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: CopilotProviderService, useValue: {} },
        { provide: ToastrService, useValue: {} }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(CopilotProviderModelComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    const component = fixture.componentInstance
    component.modelName.set('known')
    fixture.detectChanges()
    expect(component.configuration()).toMatchObject({
      contextSize: 64000,
      maxOutputTokens: 8192,
      defaultMaxTokens: 4096
    })
    component.configuration.set({ ...component.configuration(), contextSize: 96000 })
    fixture.detectChanges()
    expect(component.configuration()?.contextSize).toBe(96000)
    component.modelName.set('saved')
    fixture.detectChanges()
    expect(component.configuration()?.contextSize).toBe(32000)
    component.modelName.set('unknown')
    fixture.detectChanges()
    expect(component.configuration()).toEqual(defaultModelConfiguration(AiModelTypeEnum.LLM))
    await fixture.whenStable()
    fixture.destroy()
  })

  it('saves edited parameters with adapter settings and supports explicit reclassification', async () => {
    const configuration = defaultModelConfiguration(AiModelTypeEnum.LLM)
    const properties = {
      endpoint_model_name: 'upstream-id',
      discovery_model_id: 'qwen3',
      model_configuration: configuration
    }
    const service = {
      getModel: jest
        .fn()
        .mockReturnValue(
          of({ id: 'model-id', modelName: 'qwen3', modelType: AiModelTypeEnum.LLM, modelProperties: properties })
        ),
      updateModel: jest.fn().mockReturnValue(of({ id: 'model-id' }))
    }
    await TestBed.configureTestingModule({
      imports: [CopilotProviderModelComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: {
            modelId: 'model-id',
            provider: {
              id: 'provider-id',
              providerName: 'xirang',
              provider: {
                label: { en_US: 'Xirang' },
                supported_model_types: [
                  AiModelTypeEnum.LLM,
                  AiModelTypeEnum.TEXT_EMBEDDING,
                  AiModelTypeEnum.RERANK,
                  AiModelTypeEnum.IMAGE
                ],
                model_credential_schema: {
                  model: { label: { en_US: 'Model' }, placeholder: { en_US: 'Model' } },
                  credential_form_schemas: []
                }
              }
            }
          }
        },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: CopilotProviderService, useValue: service },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(CopilotProviderModelComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const component = fixture.componentInstance
    expect(component.configuration()).toEqual(configuration)
    expect(component.supported_model_types()).toContain(AiModelTypeEnum.IMAGE)
    component.configuration.set({ ...configuration, contextSize: 64000, maxConcurrency: 4 })
    component.modelName.set('renamed')
    fixture.detectChanges()
    component.updateModel()
    expect(service.updateModel).toHaveBeenCalledWith(
      'provider-id',
      'model-id',
      expect.objectContaining({
        modelName: 'renamed',
        modelProperties: {
          ...properties,
          model_configuration: { ...configuration, contextSize: 64000, maxConcurrency: 4 }
        }
      })
    )
    await fixture.whenStable()
    component.modelTypes.set([AiModelTypeEnum.RERANK])
    fixture.detectChanges()
    expect(component.configuration()).toEqual(defaultModelConfiguration(AiModelTypeEnum.RERANK))
    await fixture.whenStable()
  })
})

describe('manual model types with account discovery', () => {
  const supportedTypes = [AiModelTypeEnum.LLM, AiModelTypeEnum.SPEECH2TEXT, AiModelTypeEnum.TTS, AiModelTypeEnum.IMAGE]
  type SavedModel = Pick<ICopilotProviderModel, 'id' | 'modelName' | 'modelType' | 'modelProperties'>

  afterEach(() => TestBed.resetTestingModule())

  async function setup(discoverySupported = true, saved?: SavedModel) {
    const service = {
      getModel: jest.fn().mockReturnValue(of(saved)),
      createModel: jest.fn().mockReturnValue(of({ id: 'created' })),
      updateModel: jest.fn().mockReturnValue(of({ id: saved?.id }))
    }
    await TestBed.configureTestingModule({
      imports: [CopilotProviderModelComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        {
          provide: DIALOG_DATA,
          useValue: {
            modelId: saved?.id,
            catalog: {
              discoverySupported,
              builtin: [],
              custom: [],
              modelDiscovery: { mode: 'configured', syncedAt: '2026-10-28T00:00:00Z', availableModelIds: [] }
            },
            provider: {
              id: 'provider-id',
              providerName: 'xirang',
              provider: {
                label: { en_US: 'Xirang' },
                supported_model_types: supportedTypes,
                model_credential_schema: {
                  model: { label: { en_US: 'Model' }, placeholder: {} },
                  credential_form_schemas: [
                    {
                      variable: 'asr_protocol',
                      type: 'text-input',
                      required: false,
                      label: { en_US: 'ASR protocol' },
                      show_on: [{ variable: '__model_type', value: AiModelTypeEnum.SPEECH2TEXT }]
                    },
                    {
                      variable: 'tts_app_id',
                      type: 'text-input',
                      required: true,
                      label: { en_US: 'Speech AppID' },
                      show_on: [{ variable: '__model_type', value: AiModelTypeEnum.TTS }]
                    }
                  ]
                }
              }
            }
          }
        },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: CopilotProviderService, useValue: service },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(CopilotProviderModelComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    await fixture.whenStable()
    return { fixture, component: fixture.componentInstance, service }
  }

  it.each([true, false])('keeps all manual type choices when discovery support is %s', async (discoverySupported) => {
    const { fixture, component } = await setup(discoverySupported)
    expect(component.supported_model_types()).toEqual(supportedTypes)
    expect(fixture.nativeElement.querySelectorAll('z-radio')).toHaveLength(supportedTypes.length)
    await fixture.whenStable()
    fixture.destroy()
  })

  it.each([AiModelTypeEnum.SPEECH2TEXT, AiModelTypeEnum.TTS, AiModelTypeEnum.IMAGE])(
    'creates a manual %s model without a text configuration in a configured account catalog',
    async (type) => {
      const { fixture, component, service } = await setup()
      expect(component.configuration()?.modelType).toBe(AiModelTypeEnum.LLM)
      component.modelTypes.set([type])
      component.modelName.set('manual-model')
      const properties = type === AiModelTypeEnum.TTS ? { tts_app_id: 'test-app' } : { asr_protocol: 'sync' }
      component.credentials.set(properties)
      fixture.detectChanges()
      await fixture.whenStable()
      fixture.detectChanges()
      expect(component.configuration()).toBeNull()
      expect(fixture.nativeElement.querySelector('copilot-model-configuration')).toBeNull()
      if (type === AiModelTypeEnum.TTS) expect(fixture.nativeElement.textContent).toContain('Speech AppID')
      if (type === AiModelTypeEnum.SPEECH2TEXT) expect(fixture.nativeElement.textContent).toContain('ASR protocol')
      expect(component.invalid).toBeFalsy()
      component.apply()
      expect(service.createModel).toHaveBeenCalledWith('provider-id', {
        providerName: 'xirang',
        modelType: type,
        modelName: 'manual-model',
        modelProperties: properties
      })
      component.modelTypes.set([AiModelTypeEnum.LLM])
      fixture.detectChanges()
      expect(component.configuration()).toEqual(defaultModelConfiguration(AiModelTypeEnum.LLM))
      await fixture.whenStable()
      fixture.destroy()
    }
  )

  it.each([AiModelTypeEnum.SPEECH2TEXT, AiModelTypeEnum.TTS])(
    'reopens and saves manual %s credentials',
    async (type) => {
      const properties = type === AiModelTypeEnum.TTS ? { tts_app_id: 'test-app' } : { asr_protocol: 'sync' }
      const { fixture, component, service } = await setup(true, {
        id: 'saved',
        modelName: 'voice-model',
        modelType: type,
        modelProperties: properties
      })
      expect(component.modelTypes()).toEqual([type])
      expect(component.configuration()).toBeNull()
      expect(component.credentials()).toEqual(properties)
      expect(component.invalid).toBeFalsy()
      component.apply()
      expect(service.updateModel).toHaveBeenCalledWith('provider-id', 'saved', {
        modelType: type,
        modelName: 'voice-model',
        modelProperties: properties
      })
      await fixture.whenStable()
      fixture.destroy()
    }
  )

  it('removes persisted text configuration when reclassifying a model as speech', async () => {
    const { fixture, component, service } = await setup(true, {
      id: 'saved',
      modelName: 'opaque-id',
      modelType: AiModelTypeEnum.LLM,
      modelProperties: {
        endpoint_model_name: 'opaque-id',
        asr_protocol: 'sync',
        model_configuration: defaultModelConfiguration(AiModelTypeEnum.LLM)
      }
    })
    component.modelTypes.set([AiModelTypeEnum.SPEECH2TEXT])
    fixture.detectChanges()
    await fixture.whenStable()
    expect(component.configuration()).toBeNull()
    component.apply()
    expect(service.updateModel).toHaveBeenCalledWith('provider-id', 'saved', {
      modelType: AiModelTypeEnum.SPEECH2TEXT,
      modelName: 'opaque-id',
      modelProperties: { endpoint_model_name: 'opaque-id', asr_protocol: 'sync' }
    })
    component.modelTypes.set([AiModelTypeEnum.LLM])
    fixture.detectChanges()
    expect(component.configuration()).toEqual(defaultModelConfiguration(AiModelTypeEnum.LLM))
    await fixture.whenStable()
    fixture.destroy()
  })
})
