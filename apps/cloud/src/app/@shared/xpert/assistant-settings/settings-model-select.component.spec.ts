import { TestBed } from '@angular/core/testing'
import { FormControl } from '@angular/forms'
import type { TCopilotModel } from '@xpert-ai/contracts'

jest.mock('@cloud/app/@shared/copilot', () => ({ CopilotModelSelectComponent: class {} }))

import { SettingsModelSelectComponent } from './settings-model-select.component'

describe('settings model selection hydration', () => {
  afterEach(() => TestBed.resetTestingModule())
  it('ignores catalog normalization until a user interacts with the picker', () => {
    TestBed.overrideComponent(SettingsModelSelectComponent, { set: { imports: [], template: '' } })
    const fixture = TestBed.createComponent(SettingsModelSelectComponent)
    const value = { copilotId: 'provider', model: 'primary' }
    const control = new FormControl<TCopilotModel | null>(value)
    fixture.componentRef.setInput('control', control)
    const normalized = { ...value, options: { temperature: 0.7 } }
    fixture.componentInstance.change(normalized)
    expect(control.value).toBe(value)
    expect(control.pristine).toBe(true)
    fixture.componentInstance.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }))
    fixture.componentInstance.change(normalized)
    expect(control.value).toEqual(normalized)
    expect(control.dirty).toBe(true)
  })
})
