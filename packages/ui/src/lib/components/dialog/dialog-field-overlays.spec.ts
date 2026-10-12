import { Dialog } from '@angular/cdk/dialog'
import { OverlayContainer } from '@angular/cdk/overlay'
import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { provideZard } from '../../core/provider/providezard'
import { ZardComboboxComponent } from '../combobox/combobox.component'
import { ZardDatePickerComponent } from '../date-picker/date-picker.component'
import { XpDialogFrameImports } from './dialog-frame.directive'

@Component({
  imports: [ReactiveFormsModule, ZardComboboxComponent, ZardDatePickerComponent, ...XpDialogFrameImports],
  template: `
    <section xpDialogLayout="standard">
      <div xpDialogBody>
        <z-date-picker [formControl]="date" />
        <z-combobox [formControl]="assistant" [options]="options" />
      </div>
    </section>
  `
})
class DialogFieldsHost {
  readonly date = new FormControl<Date | null>(null)
  readonly assistant = new FormControl('analyst')
  readonly options = [{ value: 'analyst', label: 'Analyst' }]
}

describe('Dialog field overlays', () => {
  for (const field of ['z-date-picker', 'z-combobox']) {
    it(`dismisses ${field} first, restores focus and preserves the value before closing the Dialog`, async () => {
      TestBed.configureTestingModule({ providers: [provideZard()] })
      const fixture = TestBed.createComponent(DialogFieldsHost)
      fixture.detectChanges()
      const dialog = TestBed.inject(Dialog)
      const ref = dialog.open(DialogFieldsHost, { autoFocus: false })
      ref.componentRef!.changeDetectorRef.detectChanges()
      const overlay = TestBed.inject(OverlayContainer).getContainerElement()
      const trigger = overlay.querySelector<HTMLButtonElement>(`.cdk-dialog-container ${field} button`)!
      trigger.click()
      ref.componentRef!.changeDetectorRef.detectChanges()
      await fixture.whenStable()
      expect(overlay.querySelector('z-popover')).not.toBeNull()
      expect(trigger.getAttribute('aria-expanded')).toBe('true')
      const popupTarget = overlay.querySelector<HTMLElement>('z-popover input, z-popover button')!
      popupTarget.focus()
      popupTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
      await fixture.whenStable()
      expect(overlay.querySelector('z-popover')).toBeNull()
      expect(dialog.openDialogs).toContain(ref)
      expect(document.activeElement).toBe(trigger)
      expect(ref.componentInstance!.assistant.value).toBe('analyst')
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
      await fixture.whenStable()
      expect(dialog.openDialogs).not.toContain(ref)
      fixture.destroy()
    })
  }

  it('keeps a disabled date field inert inside a Dialog', async () => {
    TestBed.configureTestingModule({ providers: [provideZard()] })
    const fixture = TestBed.createComponent(DialogFieldsHost)
    fixture.componentInstance.date.disable()
    fixture.detectChanges()
    const trigger = fixture.nativeElement.querySelector('z-date-picker button') as HTMLButtonElement
    expect(trigger.disabled).toBe(true)
    trigger.click()
    await fixture.whenStable()
    expect(TestBed.inject(OverlayContainer).getContainerElement().querySelector('z-popover')).toBeNull()
    fixture.destroy()
  })
})
