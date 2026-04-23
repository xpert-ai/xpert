import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ParameterType } from '../../../@core'
import { ModelParameterInputComponent } from './input.component'

describe('ModelParameterInputComponent', () => {
  let component: ModelParameterInputComponent
  let fixture: ComponentFixture<ModelParameterInputComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ModelParameterInputComponent]
    }).compileComponents()

    fixture = TestBed.createComponent(ModelParameterInputComponent)
    component = fixture.componentInstance
  })

  it('coerces float input values to numbers', () => {
    fixture.componentRef.setInput('parameter', {
      name: 'temperature',
      label: { en_US: 'Temperature' },
      type: ParameterType.FLOAT
    })
    component['cva'].value$.set(0.2)
    fixture.detectChanges()

    const input = fixture.nativeElement.querySelector('input[type="number"]') as HTMLInputElement
    input.value = '0.7'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()

    expect(component['cva'].value$()).toBe(0.7)
    expect(typeof component['cva'].value$()).toBe('number')
  })

  it('coerces int input values to numbers', () => {
    fixture.componentRef.setInput('parameter', {
      name: 'max_tokens',
      label: { en_US: 'Max Tokens' },
      type: ParameterType.INT
    })
    component['cva'].value$.set(64)
    fixture.detectChanges()

    const input = fixture.nativeElement.querySelector('input[type="number"]') as HTMLInputElement
    input.value = '256'
    input.dispatchEvent(new Event('input'))
    fixture.detectChanges()

    expect(component['cva'].value$()).toBe(256)
    expect(typeof component['cva'].value$()).toBe('number')
  })
})
