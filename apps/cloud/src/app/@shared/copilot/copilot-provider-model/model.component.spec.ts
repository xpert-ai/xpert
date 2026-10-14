import { TestBed } from '@angular/core/testing'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, defaultModelConfiguration } from '@xpert-ai/contracts'
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
    expect(component.supported_model_types()).not.toContain(AiModelTypeEnum.IMAGE)
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
    component.modelTypes.set([AiModelTypeEnum.RERANK])
    fixture.detectChanges()
    expect(component.configuration()).toEqual(defaultModelConfiguration(AiModelTypeEnum.RERANK))
  })
})
