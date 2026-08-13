import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import { AiModelTypeEnum, ToastrService, XpertAPIService } from '@cloud/app/@core'
import { of } from 'rxjs'
import { XpertBasicFormComponent } from './basic-form.component'

describe('XpertBasicFormComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule()
  })

  it('keeps the form invalid when a model is selected but the required ID is empty', () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: XpertAPIService,
          useValue: {
            validateName: jest.fn(() => of(true))
          }
        },
        {
          provide: TranslateService,
          useValue: {
            instant: jest.fn((key: string, params?: { Default?: string }) => params?.Default ?? key)
          }
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn()
          }
        }
      ]
    })

    const component = TestBed.runInInjectionContext(() => new XpertBasicFormComponent())

    component.copilotModel.set({
      copilotId: 'copilot-1',
      model: 'qwen3.7-plus',
      modelType: AiModelTypeEnum.LLM
    })

    expect(component.invalid()).toBe(true)
  })
})
