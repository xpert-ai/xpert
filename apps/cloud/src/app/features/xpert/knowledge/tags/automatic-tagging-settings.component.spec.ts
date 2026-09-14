jest.mock('@cloud/app/@shared/copilot', () => {
  const { Component, forwardRef } = require('@angular/core')
  const { NG_VALUE_ACCESSOR } = require('@angular/forms')
  class CopilotModelSelectComponent {
    writeValue = jest.fn()
    registerOnChange = jest.fn()
    registerOnTouched = jest.fn()
  }
  Component({
    selector: 'copilot-model-select',
    standalone: true,
    template: '',
    inputs: ['modelType', 'label'],
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CopilotModelSelectComponent), multi: true }]
  })(CopilotModelSelectComponent)
  return { CopilotModelSelectComponent }
})
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { AutomaticTaggingSettingsComponent } from './automatic-tagging-settings.component'

describe('automatic tagging settings', () => {
  it('keeps numeric inputs consistent when consecutive edits normalize to the same limit', async () => {
    await TestBed.configureTestingModule({
      imports: [AutomaticTaggingSettingsComponent, TranslateModule.forRoot()]
    }).compileComponents()
    const fixture = TestBed.createComponent(AutomaticTaggingSettingsComponent)
    fixture.componentRef.setInput('config', { enabled: true, maxTags: 3, confidenceThreshold: 0.7 })
    fixture.detectChanges()
    await fixture.whenStable()
    const inputs: NodeListOf<HTMLInputElement> = fixture.nativeElement.querySelectorAll('input[type="number"]')
    for (const [index, values, expected] of [
      [0, [0, 1, 3, 10, 11, 2.9], [1, 1, 3, 10, 10, 2]],
      [1, [0, -1, 0.7, 1, 1.1], [0, 0, 0.7, 1, 1]]
    ] as const) {
      for (let i = 0; i < values.length; i++) {
        inputs[index].value = String(values[i])
        inputs[index].dispatchEvent(new Event('input', { bubbles: true }))
        fixture.detectChanges()
        await fixture.whenStable()
        fixture.detectChanges()
        await fixture.whenStable()
        expect(inputs[index].value).toBe(String(expected[i]))
        expect(
          index === 0
            ? fixture.componentInstance.config().maxTags
            : fixture.componentInstance.config().confidenceThreshold
        ).toBe(expected[i])
      }
    }
  })

  it('preserves dedicated model and manual priority while enforcing numeric limits', () => {
    const component = TestBed.runInInjectionContext(() => new AutomaticTaggingSettingsComponent())
    component.update('model', { model: 'classification', copilotId: 'provider' })
    component.update('enabled', true)
    component.setMaximum(99)
    component.setConfidence(0.85)
    expect(component.config()).toMatchObject({
      enabled: true,
      model: { model: 'classification' },
      maxTags: 10,
      confidenceThreshold: 0.85
    })
    expect(component.config()?.allowWithManualTags).toBeUndefined()
    component.update('allowWithManualTags', true)
    component.update('enabled', false)
    expect(component.config()).toMatchObject({ enabled: false, allowWithManualTags: true, maxTags: 10 })
    component.setMaximum(null)
    component.setConfidence(NaN)
    expect(component.config()).toMatchObject({ maxTags: 3, confidenceThreshold: 0.7 })
  })
})
