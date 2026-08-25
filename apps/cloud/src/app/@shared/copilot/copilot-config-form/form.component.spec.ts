jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

import { Dialog } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { AiModelTypeEnum, AiProviderRole } from '@xpert-ai/contracts'
import { Subject } from 'rxjs'
import { CopilotServerService, ToastrService } from '../../../@core'
import { CopilotConfigFormComponent } from './form.component'

describe('CopilotConfigFormComponent', () => {
  let component: CopilotConfigFormComponent
  let fixture: ComponentFixture<CopilotConfigFormComponent>
  let dialogClosed: Subject<string | undefined>

  beforeEach(() => {
    dialogClosed = new Subject<string | undefined>()

    TestBed.configureTestingModule({
      imports: [CopilotConfigFormComponent],
      providers: [
        {
          provide: CopilotServerService,
          useValue: {
            refresh: jest.fn()
          }
        },
        {
          provide: ToastrService,
          useValue: {
            error: jest.fn(),
            success: jest.fn()
          }
        },
        {
          provide: Dialog,
          useValue: {
            open: jest.fn().mockReturnValue({
              closed: dialogClosed.asObservable()
            })
          }
        }
      ]
    }).overrideComponent(CopilotConfigFormComponent, {
      set: {
        imports: [],
        template: ''
      }
    })

    fixture = TestBed.createComponent(CopilotConfigFormComponent)
    component = fixture.componentInstance
  })

  it('uses LLM models for the reasoning provider', () => {
    fixture.componentRef.setInput('copilot', { role: AiProviderRole.Reasoning })
    fixture.detectChanges()

    expect(component.defaultModelType()).toBe(AiModelTypeEnum.LLM)
  })

  it('notifies its parent after deleting the model provider', () => {
    const saved = jest.fn()
    component.saved.subscribe(saved)

    component.removedModelProvider()

    expect(saved).toHaveBeenCalledTimes(1)
  })

  it('notifies its parent after selecting a model provider', () => {
    const saved = jest.fn()
    component.saved.subscribe(saved)

    component.openAiProviders()
    expect(saved).not.toHaveBeenCalled()

    dialogClosed.next('provider-id')

    expect(saved).toHaveBeenCalledTimes(1)
  })
})
