import { Component, ViewChild } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'

import { ZardSwitchChange, ZardSwitchComponent } from './switch.component'

@Component({
  imports: [ReactiveFormsModule, ZardSwitchComponent],
  template: `
    <z-switch
      #switchRef="zSwitch"
      class="host-marker"
      controlClass="control-marker"
      labelClass="label-marker"
      labelPosition="before"
      [formControl]="control"
      [required]="true"
      [tabIndex]="3"
      (change)="onSwitchChange($event)"
    >
      Enable feature
    </z-switch>
  `
})
class ReactiveHostComponent {
  @ViewChild('switchRef', { static: true }) switchComponent!: ZardSwitchComponent

  readonly control = new FormControl<boolean | null>(false)
  event: ZardSwitchChange | null = null

  onSwitchChange(event: ZardSwitchChange) {
    this.event = event
  }
}

@Component({
  imports: [FormsModule, ZardSwitchComponent],
  template: ` <z-switch [(ngModel)]="value" [disabled]="disabled"> Enabled </z-switch> `
})
class NgModelHostComponent {
  value = false
  disabled = false
}

describe('ZardSwitchComponent', () => {
  it('supports reactive forms, host classes, focus, and change output', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ReactiveHostComponent]
    }).createComponent(ReactiveHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const host = fixture.nativeElement.querySelector('z-switch') as HTMLElement
    const button = fixture.nativeElement.querySelector('button[role="switch"]') as HTMLButtonElement
    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement

    expect(host.className).toContain('host-marker')
    expect(host.className).toContain('flex-row-reverse')
    expect(host.getAttribute('data-label-position')).toBe('before')
    expect(button.className).toContain('control-marker')
    expect(button.getAttribute('tabindex')).toBe('3')
    expect(button.getAttribute('required')).toBe('')
    expect(label.className).toContain('label-marker')

    fixture.componentInstance.switchComponent.focus()
    expect(document.activeElement).toBe(button)

    button.click()
    fixture.detectChanges()

    expect(fixture.componentInstance.control.value).toBe(true)
    expect(fixture.componentInstance.event?.checked).toBe(true)
    expect(fixture.componentInstance.event?.source).toBe(fixture.componentInstance.switchComponent)
    expect(button.getAttribute('aria-checked')).toBe('true')
  })

  it('supports ngModel bindings and disabled state', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [NgModelHostComponent]
    }).createComponent(NgModelHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const button = fixture.nativeElement.querySelector('button[role="switch"]') as HTMLButtonElement
    expect(button.getAttribute('aria-checked')).toBe('false')

    button.click()
    fixture.detectChanges()

    expect(fixture.componentInstance.value).toBe(true)

    fixture.componentInstance.disabled = true
    fixture.detectChanges()

    expect(button.disabled).toBe(true)
  })
})
