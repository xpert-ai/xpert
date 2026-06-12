import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'

import { ZardButtonComponent } from './button.component'
import { XpDialogActionsDirective } from '../dialog/dialog-layout.directive'

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

describe('ZardButtonComponent', () => {
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
})
