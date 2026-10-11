import { OverlayContainer } from '@angular/cdk/overlay'
import { Dialog } from '@angular/cdk/dialog'
import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ZardButtonComponent } from '../button/button.component'
import { ZardInputDirective } from '../input/input.directive'
import { ZardSelectImports } from '../select/select.imports'
import { XpDialogActionGroupDirective } from './dialog-action-group.directive'
import type { XpDialogPurpose } from './dialog-context'
import { XpDialogFrameImports } from './dialog-frame.directive'
import { provideZard } from '../../core/provider/providezard'

@Component({
  imports: [
    XpDialogActionGroupDirective,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardSelectImports
  ],
  template: `
    <section xpDialogLayout="wide" [xpDialogPurpose]="purpose()">
      <header xpDialogHeader>
        <h2 xpDialogHeading>Profile</h2>
        <p xpDialogDescription>Update your profile.</p>
        <button xpDialogCloseButton z-button zSize="icon" aria-label="Close">×</button>
      </header>
      <div xpDialogBody>
        <div xpDialogActionGroup="inline">
          <input z-input aria-label="Name" />
          <z-select zValue="editor"><z-select-item zValue="editor">Editor</z-select-item></z-select>
          <button z-button (click)="clicks.set(clicks() + 1)">Add</button>
        </div>
        <textarea z-input aria-label="Notes"></textarea>
        <z-select [zMultiple]="true"><z-select-item zValue="editor">Editor</z-select-item></z-select>
      </div>
      <footer xpDialogFooter>
        <button z-button zType="outline">Cancel</button>
        <button z-button [zLoading]="busy()" [zDisabled]="busy()">Save profile</button>
      </footer>
      <section xpDialogLayout="standard">
        <footer xpDialogFooter><button z-button>Nested action</button></footer>
      </section>
    </section>
    <input z-input aria-label="Outside" />
    <z-select><z-select-item zValue="editor">Outside item</z-select-item></z-select>
    <button z-button>Outside action</button>
  `
})
class DialogFrameHost {
  readonly purpose = signal<XpDialogPurpose>('standard')
  readonly busy = signal(false)
  readonly clicks = signal(0)
}

describe('shared Dialog layout', () => {
  it('closes only the select popup on Escape and restores focus inside the parent CDK Dialog', async () => {
    TestBed.configureTestingModule({ providers: [provideZard()] })
    const fixture = TestBed.createComponent(DialogFrameHost)
    fixture.detectChanges()
    const dialog = TestBed.inject(Dialog)
    const ref = dialog.open(DialogFrameHost, { autoFocus: false })
    ref.componentRef!.changeDetectorRef.detectChanges()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    const trigger = overlay.querySelector<HTMLButtonElement>('.cdk-dialog-container [role=combobox]')!
    trigger.click()
    ref.componentRef!.changeDetectorRef.detectChanges()
    await fixture.whenStable()
    const popup = overlay.querySelector<HTMLElement>('[role=listbox]')!
    expect(popup).not.toBeNull()
    popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
    await fixture.whenStable()
    expect(overlay.querySelector('[role=listbox]')).toBeNull()
    expect(dialog.openDialogs).toContain(ref)
    expect(document.activeElement).toBe(trigger)
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }))
    await fixture.whenStable()
    expect(dialog.openDialogs).not.toContain(ref)
  })

  it('aligns opt-in fields and actions without resizing textareas, multiselects, menu items or outside controls', () => {
    const fixture = TestBed.createComponent(DialogFrameHost)
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    const row = host.querySelector('[xpDialogActionGroup]')!
    for (const element of row.querySelectorAll('input, button')) {
      expect(element.classList.contains('h-[36px]')).toBe(true)
    }
    expect(host.querySelector('textarea')!.classList.contains('h-auto')).toBe(true)
    expect(host.querySelectorAll('z-select button')[1].classList.contains('h-auto')).toBe(true)
    row.querySelector<HTMLButtonElement>('[role=combobox]')!.click()
    fixture.detectChanges()
    const overlay = TestBed.inject(OverlayContainer).getContainerElement()
    expect(overlay.querySelector('z-select-item')!.classList.contains('h-[36px]')).toBe(false)
    row.querySelector<HTMLButtonElement>('[role=combobox]')!.click()
    fixture.detectChanges()
    expect(host.querySelector('input[aria-label="Outside"]')!.classList.contains('h-[36px]')).toBe(false)
    expect(host.querySelectorAll('z-select button')[2].classList.contains('h-[36px]')).toBe(false)
    row.querySelector<HTMLButtonElement>('button[z-button]')!.click()
    expect(fixture.componentInstance.clicks()).toBe(1)
  })

  it('applies workflow emphasis to the whole footer while header, inline and nested Dialog actions remain normal', () => {
    const fixture = TestBed.createComponent(DialogFrameHost)
    fixture.detectChanges()
    const host: HTMLElement = fixture.nativeElement
    const footer = host.querySelector('footer')!
    for (const button of footer.querySelectorAll('button')) expect(button.classList.contains('h-[36px]')).toBe(true)
    fixture.componentInstance.purpose.set('workflow')
    fixture.componentInstance.busy.set(true)
    fixture.detectChanges()
    for (const button of footer.querySelectorAll('button')) expect(button.classList.contains('h-[40px]')).toBe(true)
    const save = footer.querySelectorAll('button')[1]
    expect(save.disabled).toBe(true)
    expect(save.textContent).toContain('Save profile')
    expect(save.querySelector('span')!.classList.contains('opacity-0')).toBe(true)
    expect(save.querySelector('ng-icon')!.classList.contains('absolute')).toBe(true)
    expect(save.getAttribute('aria-busy')).toBe('true')
    expect(host.querySelector('header button')!.classList.contains('h-[36px]')).toBe(true)
    expect(host.querySelector('[xpDialogActionGroup] button[z-button]')!.classList.contains('h-[36px]')).toBe(true)
    expect(host.querySelectorAll('footer')[1].querySelector('button')!.classList.contains('h-[36px]')).toBe(true)
  })
})
