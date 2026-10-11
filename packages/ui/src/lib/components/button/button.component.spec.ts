import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { ZardButtonComponent } from './button.component'
import { XpDialogActionsDirective } from '../dialog/dialog-layout.directive'
import { XpDialogLayoutDirective } from '../dialog/dialog-frame.directive'
import { XpDialogActionGroupDirective } from '../dialog/dialog-action-group.directive'

@Component({
  imports: [ZardButtonComponent],
  template: `
    <button z-button zType="ghost">Cancel</button>
    <button z-button zType="default" class="host-marker">Save</button>
  `
})
class ButtonHostComponent {}

@Component({
  imports: [ZardButtonComponent, XpDialogActionsDirective],
  template: `
    <div xpDialogActions align="end" class="!mt-1 pt-0">
      <div class="inline-flex items-center gap-2">
        <button type="button" z-button zType="ghost">Cancel</button>
        <button type="button" z-button zType="default">Save</button>
      </div>
    </div>
  `
})
class DialogActionsButtonHostComponent {}

@Component({
  imports: [ZardButtonComponent, XpDialogActionGroupDirective],
  template: `
    <header xpDialogActionGroup="header">
      <button z-button zType="ghost" zSize="icon" aria-label="Close">×</button>
    </header>
    <section xpDialogActionGroup="inline">
      <button z-button class="h-6" (click)="clicks.set(clicks() + 1)">Cancel</button>
    </section>
    <footer xpDialogActionGroup="footer">
      <button z-button [zLoading]="busy()" [zDisabled]="busy()">Save</button>
    </footer>
    <button z-button zSize="sm">List tool</button>
  `
})
class DialogActionHostComponent {
  readonly busy = signal(false)
  readonly clicks = signal(0)
}

@Component({
  imports: [ZardButtonComponent, XpDialogActionGroupDirective, XpDialogLayoutDirective],
  template: `
    <section xpDialogLayout="standard" xpDialogPurpose="workflow">
      <footer [xpDialogActionGroup]="role()">
        <div>
          <button z-button zType="secondary" zSize="sm">Reset</button>
          <button z-button [zLoading]="busy()" [zDisabled]="busy()">Save</button>
          <button z-button zSize="icon" aria-label="More">+</button>
        </div>
        <section xpDialogActionGroup="inline">
          <button z-button>Nested action</button>
        </section>
      </footer>
    </section>
    <button z-button>Separate action</button>
  `
})
class DialogActionGroupHostComponent {
  readonly role = signal<'inline' | 'footer'>('footer')
  readonly busy = signal(false)
}

describe('ZardButtonComponent', () => {
  it('keeps every button in an action group the same size, including loading and icon buttons', () => {
    const fixture = TestBed.configureTestingModule({ imports: [DialogActionGroupHostComponent] }).createComponent(
      DialogActionGroupHostComponent
    )
    fixture.detectChanges()
    const groupButtons = fixture.nativeElement.querySelectorAll('footer > div button') as NodeListOf<HTMLButtonElement>
    const outsideButton = fixture.nativeElement.querySelector('section + button') as HTMLButtonElement

    for (const button of groupButtons) {
      expect(button.getAttribute('data-dialog-action')).toBe('footer')
      expect(button.classList.contains('h-[40px]')).toBe(true)
      expect(button.classList.contains('h-[36px]')).toBe(false)
    }
    expect(groupButtons[2].classList.contains('w-[40px]')).toBe(true)
    expect(outsideButton.getAttribute('data-dialog-action')).toBeNull()
    const nestedButton = fixture.nativeElement.querySelector('footer section button') as HTMLButtonElement
    expect(nestedButton.getAttribute('data-dialog-action')).toBe('inline')
    expect(nestedButton.classList.contains('h-[36px]')).toBe(true)
    expect(groupButtons[0].classList.contains('min-w-[80px]')).toBe(false)

    fixture.componentInstance.busy.set(true)
    fixture.detectChanges()
    expect(groupButtons[1].disabled).toBe(true)
    expect(groupButtons[1].classList.contains('h-[40px]')).toBe(true)

    fixture.componentInstance.role.set('inline')
    fixture.detectChanges()
    for (const button of groupButtons) {
      expect(button.getAttribute('data-dialog-action')).toBe('inline')
      expect(button.classList.contains('h-[36px]')).toBe(true)
      expect(button.classList.contains('h-[40px]')).toBe(false)
    }
  })
  it('applies Zard classes to native button hosts', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ButtonHostComponent]
    }).createComponent(ButtonHostComponent)

    fixture.detectChanges()

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>

    expect(buttons[0].className).toContain('inline-flex')
    expect(buttons[0].className).toContain('hover:bg-muted')
    expect(buttons[0].className).toContain('h-8')
    expect(buttons[1].className).toContain('host-marker')
    expect(buttons[1].className).toContain('bg-primary')
    expect(buttons[1].className).toContain('text-primary-foreground')
  })

  it('keeps Zard classes inside dialog actions', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [DialogActionsButtonHostComponent]
    }).createComponent(DialogActionsButtonHostComponent)

    fixture.detectChanges()

    const actions = fixture.nativeElement.querySelector('[xpDialogActions]') as HTMLElement
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>

    expect(actions.className).toContain('justify-end')
    expect(buttons[0].className).toContain('inline-flex')
    expect(buttons[0].className).toContain('hover:bg-muted')
    expect(buttons[1].className).toContain('bg-primary')
    expect(buttons[1].className).toContain('text-primary-foreground')
  })
  it('derives geometry from each region without button sizing inputs or changes to body tools', () => {
    const fixture = TestBed.configureTestingModule({ imports: [DialogActionHostComponent] }).createComponent(
      DialogActionHostComponent
    )
    fixture.componentInstance.busy.set(true)
    fixture.detectChanges()
    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>
    expect(buttons[0].classList.contains('h-[36px]')).toBe(true)
    expect(buttons[0].classList.contains('w-[36px]')).toBe(true)
    expect(buttons[1].classList.contains('min-h-[36px]')).toBe(true)
    expect(buttons[1].classList.contains('pointer-coarse:min-h-[44px]')).toBe(true)
    expect(buttons[2].classList.contains('h-[36px]')).toBe(true)
    expect(buttons[2].disabled).toBe(true)
    expect(buttons[2].querySelector('ng-icon')).not.toBeNull()
    expect(buttons[3].classList.contains('h-7')).toBe(true)
    expect(buttons[3].getAttribute('data-dialog-action')).toBeNull()
    buttons[1].click()
    expect(fixture.componentInstance.clicks()).toBe(1)

    fixture.componentInstance.busy.set(false)
    fixture.detectChanges()
    expect(buttons[2].disabled).toBe(false)
    expect(buttons[2].classList.contains('h-[36px]')).toBe(true)
  })
})
