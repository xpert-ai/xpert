import { OverlayContainer } from '@angular/cdk/overlay'
import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { provideUiI18nAdapter } from '../../core/i18n/ui-i18n.service'
import { provideZard } from '../../core/provider/providezard'
import { ZardDateTimePickerComponent } from './date-time-picker.component'

@Component({
  imports: [ReactiveFormsModule, ZardDateTimePickerComponent],
  template: `<z-date-time-picker [formControl]="control" label="Scheduled time" [clearable]="true" />`
})
class FormHost {
  readonly control = new FormControl<string | null>('2026-10-31T17:37')
}

@Component({
  imports: [FormsModule, ZardDateTimePickerComponent],
  template: `
    <z-date-time-picker [(value)]="value" />
    <z-date-time-picker [(ngModel)]="model" />
  `
})
class ModelHost {
  readonly value = signal('2026-10-31T17:37')
  model = '2026-11-02T08:07'
}

function action(panel: Element, text: string) {
  const button = Array.from(panel.querySelectorAll('button')).find((item) => item.textContent?.trim() === text)
  if (!button) throw new Error(`Missing action ${text}`)
  return button
}

describe('Zard date-time picker without an application dependency', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZard()] }))

  async function create() {
    const fixture = TestBed.createComponent(FormHost)
    fixture.detectChanges()
    const root: HTMLElement = fixture.nativeElement
    const trigger = root.querySelector<HTMLButtonElement>('button')!
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    const open = async () => {
      trigger.click()
      fixture.detectChanges()
      await fixture.whenStable()
      const panel = overlay.querySelector('z-popover')!
      expect(panel).not.toBeNull()
      return panel
    }
    const enterTime = (panel: Element, value: string) => {
      const input = panel.querySelector<HTMLInputElement>('input')!
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      fixture.detectChanges()
      return input
    }
    return { fixture, control: fixture.componentInstance.control, trigger, overlay, open, enterTime }
  }

  it('commits local wall time only on confirmation, clears and handles a nullable form reset', async () => {
    const { fixture, control, trigger, open, enterTime } = await create()
    const panel = await open()
    expect(panel.textContent).toContain('Hour')
    enterTime(panel, '08:07')
    expect(control.value).toBe('2026-10-31T17:37')
    action(panel, 'Confirm').click()
    fixture.detectChanges()
    expect(control.value).toBe('2026-10-31T08:07')
    expect(control.touched).toBe(true)
    expect(document.activeElement).toBe(trigger)
    action(await open(), 'Clear').click()
    fixture.detectChanges()
    expect(control.value).toBe('')
    control.reset()
    fixture.detectChanges()
    expect(trigger.textContent).toContain('Choose date and time')
  })

  it('rejects malformed time and discards drafts with Escape, restoring focus', async () => {
    const { fixture, control, trigger, overlay, open, enterTime } = await create()
    const panel = await open()
    const input = enterTime(panel, '25:99')
    expect(action(panel, 'Confirm').disabled).toBe(true)
    expect(panel.textContent).toContain('Use HH:mm')
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
    await fixture.whenStable()
    expect(overlay.querySelector('z-popover')).toBeNull()
    expect(control.value).toBe('2026-10-31T17:37')
    expect(document.activeElement).toBe(trigger)
    expect((await open()).querySelector<HTMLInputElement>('input')!.value).toBe('17:37')
  })

  it('closes an open popup when the form disables the control and restores it on enable', async () => {
    const { fixture, control, trigger, overlay, open } = await create()
    await open()
    control.disable()
    fixture.detectChanges()
    await fixture.whenStable()
    expect(overlay.querySelector('z-popover')).toBeNull()
    expect(trigger.disabled).toBe(true)
    trigger.click()
    fixture.detectChanges()
    expect(overlay.querySelector('z-popover')).toBeNull()
    control.enable()
    fixture.detectChanges()
    expect(trigger.disabled).toBe(false)
  })

  it('supports value binding and ngModel independently of reactive forms', async () => {
    const fixture = TestBed.createComponent(ModelHost)
    fixture.detectChanges()
    await fixture.whenStable()
    const root: HTMLElement = fixture.nativeElement
    const triggers = root.querySelectorAll<HTMLButtonElement>('z-date-time-picker > button')
    for (const [index, trigger] of Array.from(triggers).entries()) {
      trigger.click()
      fixture.detectChanges()
      await fixture.whenStable()
      const panel = TestBed.inject(OverlayContainer).getContainerElement().querySelector('z-popover')!
      const input = panel.querySelector<HTMLInputElement>('input')!
      input.value = '09:30'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      fixture.detectChanges()
      action(panel, 'Confirm').click()
      fixture.detectChanges()
      await fixture.whenStable()
      expect(index === 0 ? fixture.componentInstance.value() : fixture.componentInstance.model).toBe(
        index === 0 ? '2026-10-31T09:30' : '2026-11-02T09:30'
      )
    }
  })

  it('localizes through the UI adapter, permits label overrides and respects explicit disabled state', async () => {
    const language = signal('en')
    TestBed.configureTestingModule({
      providers: [
        provideUiI18nAdapter({
          language,
          translate: (key, options) => {
            if (language() === 'zh-Hans') {
              if (key === 'xp-ui:dateTimePicker.chooseDateTime') return '选择日期和时间'
              if (key === 'xp-ui:dateTimePicker.hour') return '小时'
              if (key === 'xp-ui:dateTimePicker.confirm') return '确定'
            }
            return options?.defaultValue ?? key
          }
        })
      ]
    })
    const fixture = TestBed.createComponent(ZardDateTimePickerComponent)
    fixture.detectChanges()
    const root: HTMLElement = fixture.nativeElement
    const trigger = root.querySelector<HTMLButtonElement>('button')!
    expect(trigger.textContent).toContain('Choose date and time')
    language.set('zh-Hans')
    fixture.detectChanges()
    expect(trigger.textContent).toContain('选择日期和时间')
    fixture.componentRef.setInput('label', 'Expiry')
    fixture.componentRef.setInput('placeholder', 'No expiry')
    fixture.componentRef.setInput('clearLabel', 'Clear expiry')
    fixture.componentRef.setInput('clearable', true)
    fixture.detectChanges()
    expect(trigger.getAttribute('aria-label')).toBe('Expiry: No expiry')
    trigger.click()
    fixture.detectChanges()
    await fixture.whenStable()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    const panel = overlay.querySelector('z-popover')!
    expect(action(panel, 'Clear expiry')).toBeTruthy()
    expect(action(panel, '确定')).toBeTruthy()
    expect(panel.querySelector('z-time-dial')!.textContent).toContain('小时')
    fixture.componentRef.setInput('disabled', true)
    fixture.componentInstance.setDisabledState(false)
    fixture.detectChanges()
    await fixture.whenStable()
    expect(overlay.querySelector('z-popover')).toBeNull()
    expect(trigger.disabled).toBe(true)
  })
})
