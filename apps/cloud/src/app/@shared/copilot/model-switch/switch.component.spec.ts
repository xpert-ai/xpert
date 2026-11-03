import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { HttpErrorResponse } from '@angular/common/http'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, ParameterType } from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import { CopilotServerService } from '../../../@core'
import { ModelSwitchDialogComponent } from './switch.component'

describe('model switch confirmation', () => {
  async function setup(fail = false) {
    const close = jest.fn()
    const rules = [
      { name: 'temperature', type: ParameterType.FLOAT, min: 0, max: 1, default: 0.2, label: { en_US: 'Temperature' } }
    ]
    const getModelParameterRules = jest.fn(() =>
      fail
        ? throwError(
            () =>
              new HttpErrorResponse({
                status: 403,
                error: {
                  code: 'model_parameter_rules_forbidden',
                  message: 'No access to the selected model parameters.'
                }
              })
          )
        : of(rules)
    )
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
            target: { copilotId: 'two', model: 'after', modelType: AiModelTypeEnum.LLM }
          }
        },
        {
          provide: CopilotServerService,
          useValue: { getModelParameterRules }
        }
      ]
    }).compileComponents()
    const fixture = TestBed.createComponent(ModelSwitchDialogComponent)
    await fixture.whenStable()
    fixture.detectChanges()
    return { fixture, component: fixture.componentInstance, close, previous, getModelParameterRules, rules }
  }
  afterEach(() => TestBed.resetTestingModule())
  it('previews defaults without mutating the source until confirmed', async () => {
    const { fixture, component, close, previous, getModelParameterRules } = await setup()
    expect(getModelParameterRules).toHaveBeenCalledWith('two', AiModelTypeEnum.LLM, 'after')
    expect(component.preview().options).toEqual({ temperature: 0.2 })
    expect(previous.options).toEqual({ temperature: 0.8, old_parameter: true })
    expect(close).not.toHaveBeenCalled()
    fixture.nativeElement.querySelector('footer button:last-child').click()
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ options: { temperature: 0.2 } }))
  })
  it('retains compatible values only after an explicit policy choice', async () => {
    const { component, close } = await setup()
    component.policy.set('compatible')
    component.apply()
    expect(close).toHaveBeenCalledWith(expect.objectContaining({ options: { temperature: 0.8 } }))
  })
  it.each(['reset', 'compatible'] as const)('shows a genuine denial and blocks the %s policy', async (policy) => {
    const { fixture, component, close } = await setup(true)
    component.policy.set(policy)
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    expect(host.querySelector('[role="alert"]').textContent).toContain('No access to the selected model parameters.')
    expect(host.querySelector<HTMLButtonElement>('footer button:last-child').disabled).toBe(true)
    component.apply()
    expect(close).not.toHaveBeenCalled()
  })
  it.each(['reset', 'compatible'] as const)(
    'retries parameter loading and confirms the %s policy after access recovers',
    async (policy) => {
      const { fixture, component, close, getModelParameterRules, rules } = await setup(true)
      component.policy.set(policy)
      getModelParameterRules.mockReturnValueOnce(of(rules))
      const host: HTMLElement = fixture.nativeElement
      Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent.includes('XP.ACTIONS.Retry'))
        .click()
      await fixture.whenStable()
      fixture.detectChanges()
      expect(host.querySelector('[role="alert"]')).toBeNull()
      const confirm = host.querySelector<HTMLButtonElement>('footer button:last-child')
      expect(confirm.disabled).toBe(false)
      confirm.click()
      expect(close).toHaveBeenCalledWith(
        expect.objectContaining({ options: { temperature: policy === 'reset' ? 0.2 : 0.8 } })
      )
      expect(getModelParameterRules).toHaveBeenCalledTimes(2)
    }
  )
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
