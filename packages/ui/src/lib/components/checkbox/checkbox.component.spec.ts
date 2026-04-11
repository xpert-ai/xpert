import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'

import { ZardCheckboxComponent } from './checkbox.component'

@Component({
  imports: [ReactiveFormsModule, ZardCheckboxComponent],
  template: `
    <z-checkbox
      class="host-marker"
      controlClass="control-marker"
      labelClass="label-marker"
      displayDensity="compact"
      labelPosition="before"
      [indeterminate]="indeterminate"
      [formControl]="control"
      (checkChange)="onCheckChange($event)"
    >
      Remember me
    </z-checkbox>
  `
})
class ReactiveHostComponent {
  readonly control = new FormControl<boolean | null>(null)
  indeterminate = true
  checked: boolean | null = null

  onCheckChange(value: boolean) {
    this.checked = value
  }
}

@Component({
  imports: [FormsModule, ZardCheckboxComponent],
  template: ` <z-checkbox [(ngModel)]="value" [zDisabled]="disabled"> Enabled </z-checkbox> `
})
class NgModelHostComponent {
  value = false
  disabled = false
}

describe('ZardCheckboxComponent', () => {
  it('supports reactive forms, indeterminate state, host classes, and checkChange output', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [ReactiveHostComponent]
    }).createComponent(ReactiveHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const host = fixture.nativeElement.querySelector('z-checkbox') as HTMLElement
    const input = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement
    const label = fixture.nativeElement.querySelector('label') as HTMLLabelElement

    expect(host.className).toContain('host-marker')
    expect(host.className).toContain('flex-row-reverse')
    expect(host.getAttribute('data-density')).toBe('compact')
    expect(host.getAttribute('data-indeterminate')).toBe('')
    expect(input.indeterminate).toBe(true)
    expect(input.className).toContain('control-marker')
    expect(label.className).toContain('label-marker')
    expect(label.className).toContain('text-sm')

    input.click()
    fixture.detectChanges()

    expect(fixture.componentInstance.control.value).toBe(true)
    expect(fixture.componentInstance.checked).toBe(true)
    expect(input.checked).toBe(true)
    expect(input.indeterminate).toBe(false)
    expect(host.hasAttribute('data-indeterminate')).toBe(false)
  })

  it('supports ngModel bindings and zDisabled state', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [NgModelHostComponent]
    }).createComponent(NgModelHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const input = fixture.nativeElement.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(input.checked).toBe(false)

    input.click()
    fixture.detectChanges()

    expect(fixture.componentInstance.value).toBe(true)

    fixture.componentInstance.disabled = true
    fixture.detectChanges()

    expect(input.disabled).toBe(true)
  })
})
