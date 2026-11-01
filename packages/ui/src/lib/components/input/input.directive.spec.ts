import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, ReactiveFormsModule } from '@angular/forms'

import { ZardInputDirective } from './input.directive'

@Component({
  imports: [ReactiveFormsModule, ZardInputDirective],
  template: `
    <input z-input type="text" [formControl]="textControl" />
    <input z-input type="number" [formControl]="numberControl" />
  `
})
class InputHostComponent {
  readonly textControl = new FormControl('', { nonNullable: true })
  readonly numberControl = new FormControl<number | null>(null)
}

describe('ZardInputDirective', () => {
  it('does not write native number drafts back to the DOM on input', async () => {
    const fixture = TestBed.createComponent(InputHostComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="number"]')
    input.value = '0'
    const writeValue = jest.spyOn(input, 'value', 'set')
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()
    await fixture.whenStable()
    expect(fixture.componentInstance.numberControl.value).toBe(0)
    expect(writeValue).not.toHaveBeenCalled()
    writeValue.mockRestore()
  })

  it('preserves text values and emits numbers for number inputs', async () => {
    const fixture = await TestBed.configureTestingModule({
      imports: [InputHostComponent]
    }).createComponent(InputHostComponent)

    fixture.detectChanges()
    await fixture.whenStable()

    const [textInput, numberInput] = Array.from(
      fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>
    )

    textInput.value = '10000'
    textInput.dispatchEvent(new Event('input'))
    numberInput.value = '10000'
    numberInput.dispatchEvent(new Event('input'))

    expect(fixture.componentInstance.textControl.value).toBe('10000')
    expect(fixture.componentInstance.numberControl.value).toBe(10000)

    numberInput.value = ''
    numberInput.dispatchEvent(new Event('input'))

    expect(fixture.componentInstance.numberControl.value).toBeNull()
  })
})
