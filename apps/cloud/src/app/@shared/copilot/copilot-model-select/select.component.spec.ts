import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { of, Subject } from 'rxjs'
import {
  AiModelTypeEnum,
  CopilotProviderService,
  CopilotServerService,
  ModelPropertyKey,
  ParameterType
} from '../../../@core'
import { CopilotModelSelectComponent } from './select.component'

describe('CopilotModelSelectComponent', () => {
  const copilot = {
    id: 'copilot-1',
    role: 'primary',
    name: 'Primary Copilot',
    modelProvider: {
      id: 'provider-1'
    },
    providerWithModels: {
      label: {
        en_US: 'Provider'
      },
      models: [
        {
          model: 'deepseek-chat',
          model_type: AiModelTypeEnum.LLM,
          model_properties: {
            [ModelPropertyKey.CONTEXT_SIZE]: 64000
          }
        },
        {
          model: 'glm-5',
          model_type: AiModelTypeEnum.LLM,
          model_properties: {
            [ModelPropertyKey.CONTEXT_SIZE]: 200000
          }
        },
        {
          model: 'minimal-chat',
          model_type: AiModelTypeEnum.LLM,
          model_properties: {
            [ModelPropertyKey.CONTEXT_SIZE]: 32000
          }
        }
      ]
    }
  } as any
  const deepseekModel = copilot.providerWithModels.models[0]
  const glmModel = copilot.providerWithModels.models[1]
  const minimalModel = copilot.providerWithModels.models[2]
  let deepseekRules$: Subject<any[]>
  let glmRules$: Subject<any[]>
  let component: CopilotModelSelectComponent
  let fixture: ComponentFixture<CopilotModelSelectComponent>

  beforeEach(async () => {
    deepseekRules$ = new Subject<any[]>()
    glmRules$ = new Subject<any[]>()
    const copilotServer = {
      getCopilotModels: jest.fn(() => of([copilot]))
    }
    const copilotProviderService = {
      getModelParameterRules: jest.fn((_providerId: string, _modelType: AiModelTypeEnum, model: string) => {
        switch (model) {
          case 'deepseek-chat':
            return deepseekRules$.asObservable()
          case 'glm-5':
            return glmRules$.asObservable()
          default:
            return of([])
        }
      })
    }

    await TestBed.configureTestingModule({
      imports: [CopilotModelSelectComponent],
      providers: [
        { provide: CopilotServerService, useValue: copilotServer },
        { provide: CopilotProviderService, useValue: copilotProviderService },
        {
          provide: TranslateService,
          useValue: {
            currentLang: 'en_US'
          }
        }
      ]
    })
      .overrideComponent(CopilotModelSelectComponent, {
        set: {
          template: ''
        }
      })
      .compileComponents()

    fixture = TestBed.createComponent(CopilotModelSelectComponent)
    component = fixture.componentInstance
    fixture.componentRef.setInput('modelType', AiModelTypeEnum.LLM)
    fixture.detectChanges()
  })

  afterEach(() => {
    deepseekRules$.complete()
    glmRules$.complete()
  })

  it('applies defaults when selecting a model without existing options', fakeAsync(() => {
    tick(600)
    fixture.detectChanges()
    component.setModel(copilot, glmModel)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()

    expect(component['cva'].value$()?.options).toEqual({
      [ModelPropertyKey.CONTEXT_SIZE]: 200000
    })

    glmRules$.next([
      {
        name: 'temperature',
        type: ParameterType.FLOAT,
        default: 1
      },
      {
        name: 'max_tokens',
        type: ParameterType.INT,
        default: 8192
      }
    ])
    tick()
    fixture.detectChanges()

    expect(component['cva'].value$()?.options).toEqual({
      [ModelPropertyKey.CONTEXT_SIZE]: 200000,
      temperature: 1,
      max_tokens: 8192
    })
  }))

  it('copies inherited options before applying the first local parameter override', fakeAsync(() => {
    fixture.componentRef.setInput('inheritModel', {
      copilotId: copilot.id,
      model: glmModel.model,
      modelType: AiModelTypeEnum.LLM,
      options: {
        [ModelPropertyKey.CONTEXT_SIZE]: 200000,
        temperature: 0.2,
        max_tokens: 1024,
        response_format: 'json_object'
      }
    } as any)
    tick(600)
    fixture.detectChanges()

    glmRules$.next([
      {
        name: 'temperature',
        type: ParameterType.FLOAT,
        default: 1
      },
      {
        name: 'max_tokens',
        type: ParameterType.INT,
        default: 8192
      },
      {
        name: 'response_format',
        type: ParameterType.STRING,
        default: 'text',
        options: ['text', 'json_object']
      }
    ])
    tick()
    fixture.detectChanges()

    component.updateParameter('response_format', 'text')
    tick()
    fixture.detectChanges()

    expect(component['cva'].value$()).toEqual({
      copilotId: copilot.id,
      model: glmModel.model,
      modelType: AiModelTypeEnum.LLM,
      options: {
        [ModelPropertyKey.CONTEXT_SIZE]: 200000,
        temperature: 0.2,
        max_tokens: 1024,
        response_format: 'text'
      }
    })
  }))

  it('preserves reusable options instead of resetting to defaults when switching models', fakeAsync(() => {
    tick(600)
    fixture.detectChanges()

    component.writeValue({
      copilotId: copilot.id,
      model: deepseekModel.model,
      modelType: AiModelTypeEnum.LLM,
      options: {
        [ModelPropertyKey.CONTEXT_SIZE]: 64000,
        temperature: 0.3,
        max_tokens: 256,
        response_format: 'json_object'
      }
    } as any)
    fixture.detectChanges()

    component.setModel(copilot, glmModel)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()

    glmRules$.next([
      {
        name: 'temperature',
        type: ParameterType.FLOAT,
        default: 1
      },
      {
        name: 'max_tokens',
        type: ParameterType.INT,
        default: 8192
      },
      {
        name: 'top_p',
        type: ParameterType.FLOAT,
        default: 0.9
      }
    ])
    tick()
    fixture.detectChanges()

    expect(component['cva'].value$()?.options).toEqual({
      [ModelPropertyKey.CONTEXT_SIZE]: 200000,
      temperature: 0.3,
      max_tokens: 256
    })
  }))

  it('drops non-applicable options when switching to a model without parameter rules', fakeAsync(() => {
    tick(600)
    fixture.detectChanges()

    component.writeValue({
      copilotId: copilot.id,
      model: deepseekModel.model,
      modelType: AiModelTypeEnum.LLM,
      options: {
        [ModelPropertyKey.CONTEXT_SIZE]: 64000,
        temperature: 0.3,
        max_tokens: 256
      }
    } as any)
    fixture.detectChanges()

    component.setModel(copilot, minimalModel)
    fixture.detectChanges()
    tick()
    fixture.detectChanges()

    expect(component['cva'].value$()?.options).toEqual({
      [ModelPropertyKey.CONTEXT_SIZE]: 32000
    })
  }))

  it('keeps existing options when re-selecting the same model', fakeAsync(() => {
    tick(600)
    fixture.detectChanges()

    component.setModel(copilot, deepseekModel)
    fixture.detectChanges()

    deepseekRules$.next([
      {
        name: 'temperature',
        type: ParameterType.FLOAT,
        default: 0.2
      },
      {
        name: 'max_tokens',
        type: ParameterType.INT,
        default: 64
      }
    ])
    tick()
    fixture.detectChanges()

    component.updateParameter('max_tokens', 256)
    fixture.detectChanges()

    component.setModel(copilot, deepseekModel)
    tick()
    fixture.detectChanges()

    expect(component['cva'].value$()?.options).toEqual({
      [ModelPropertyKey.CONTEXT_SIZE]: 64000,
      temperature: 0.2,
      max_tokens: 256
    })
  }))
})
