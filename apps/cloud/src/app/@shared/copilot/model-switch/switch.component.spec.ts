import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, ParameterType } from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import { CopilotProviderService } from '../../../@core'
import { ModelSwitchDialogComponent } from './switch.component'

describe('model switch confirmation', () => {
  async function setup(fail = false) {
    const close = jest.fn()
    const rules = [
      { name: 'temperature', type: ParameterType.FLOAT, min: 0, max: 1, default: 0.2, label: { en_US: 'Temperature' } }
    ]
    const previous = {
      copilotId: 'one',
      model: 'before',
      modelType: AiModelTypeEnum.LLM,
      options: { temperature: 0.8, old_parameter: true }
    }
    await TestBed.configureTestingModule({
      imports: [ModelSwitchDialogComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DialogRef, useValue: { close } },
        {
          provide: DIALOG_DATA,
          useValue: {
            previous,
            target: { copilotId: 'two', model: 'after', modelType: AiModelTypeEnum.LLM },
            providerId: 'provider'
          }
        },
        {
          provide: CopilotProviderService,
          useValue: { getModelParameterRules: () => (fail ? throwError(() => new Error('Unavailable')) : of(rules)) }
        }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(ModelSwitchDialogComponent)
    await fixture.whenStable()
    return { component: fixture.componentInstance, close, previous }
  }
  afterEach(() => TestBed.resetTestingModule())
  it('previews defaults without mutating the source until confirmed', async () => {
    const { component, close, previous } = await setup()
    expect(component.preview().options).toEqual({ temperature: 0.2 })
    expect(previous.options).toEqual({ temperature: 0.8, old_parameter: true })
    expect(close).not.toHaveBeenCalled()
    component.apply()
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ options: { temperature: 0.2 } }))
  })
  it('retains compatible values only after an explicit policy choice', async () => {
    const { component, close } = await setup()
    component.policy.set('compatible')
    component.apply()
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ options: { temperature: 0.8 } }))
  })
  it('blocks submission if parameter rules cannot be loaded', async () => {
    const { component, close } = await setup(true)
    component.apply()
    expect(close).not.toHaveBeenCalled()
  })
  it('requires missing target values and validates them before switching', async () => {
    const { component, close } = await setup()
    component.rules.set([
      { name: 'limit', label: { en_US: 'Limit' }, type: ParameterType.INT, required: true, min: 1, max: 5 }
    ])
    component.apply()
    expect(close).not.toHaveBeenCalled()
    component.setRequired('limit', 99)
    component.apply()
    expect(close).not.toHaveBeenCalled()
    component.setRequired('limit', 3)
    component.apply()
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ options: { limit: 3 } }))
  })
})
