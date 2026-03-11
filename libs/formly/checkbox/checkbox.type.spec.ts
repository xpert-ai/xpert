import { Component, forwardRef, input, NgModule, output } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { ControlValueAccessor, FormGroup, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'

import { NgmFormlyCheckboxComponent } from './checkbox.type'

@Component({
  selector: 'z-checkbox',
  standalone: false,
  template: `
    <label>
      <input
        type="checkbox"
        [checked]="value"
        [indeterminate]="indeterminate()"
        [disabled]="disabled"
        (change)="onInputChange($event)"
        (blur)="onTouched()"
      />
      <ng-content />
    </label>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => ZCheckboxStubComponent),
      multi: true
    }
  ]
})
class ZCheckboxStubComponent implements ControlValueAccessor {
  readonly indeterminate = input(false)
  readonly labelPosition = input<'before' | 'after'>('after')
  readonly checkChange = output<boolean>()

  value = false
  disabled = false
  onChange = (_value: boolean) => undefined
  onTouched = () => undefined

  writeValue(value: boolean | null): void {
    this.value = !!value
  }

  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled
  }

  onInputChange(event: Event) {
    const checked = (event.target as HTMLInputElement).checked
    this.value = checked
    this.onChange(checked)
    this.checkChange.emit(checked)
  }
}

@Component({
  selector: 'formly-checkbox-test-host',
  standalone: false,
  template: ` <formly-form [form]="form" [model]="model" [fields]="fields"></formly-form> `
})
class HostComponent {
  readonly form = new FormGroup({})
  model: Record<string, unknown> = {}
  fields: FormlyFieldConfig[] = []
}

@NgModule({
  declarations: [HostComponent, NgmFormlyCheckboxComponent, ZCheckboxStubComponent],
  imports: [
    ReactiveFormsModule,
    TranslateModule.forRoot(),
    FormlyModule.forRoot({
      types: [
        {
          name: 'checkbox',
          component: NgmFormlyCheckboxComponent
        },
        {
          name: 'boolean',
          extends: 'checkbox'
        }
      ]
    })
  ]
})
class TestCheckboxModule {}

const renderComponent = (field: FormlyFieldConfig, model: Record<string, unknown> = {}) => {
  const fixture = TestBed.configureTestingModule({
    imports: [NoopAnimationsModule, TestCheckboxModule]
  }).createComponent(HostComponent)

  fixture.componentInstance.model = model
  fixture.componentInstance.fields = [field]
  fixture.detectChanges()

  return {
    detectChanges: () => fixture.detectChanges(),
    field,
    query: (selector: string) => fixture.debugElement.query(By.css(selector))
  }
}

describe('formly: Checkbox Type', () => {
  it('should render checkbox type', () => {
    const { query } = renderComponent(
      {
        key: 'name',
        type: 'checkbox'
      },
      { name: null }
    )

    expect(query('z-checkbox')).not.toBeNull()
    expect(query('input[type="checkbox"]').properties).toMatchObject({
      indeterminate: true
    })
  })

  it('should render boolean type', () => {
    const { query } = renderComponent(
      {
        key: 'name',
        type: 'boolean'
      },
      { name: null }
    )

    expect(query('z-checkbox')).not.toBeNull()
    expect(query('input[type="checkbox"]').properties).toMatchObject({
      indeterminate: true
    })
  })

  it('should bind control value on change', () => {
    const changeSpy = jest.fn()
    const field: FormlyFieldConfig = {
      key: 'name',
      type: 'checkbox',
      props: { change: changeSpy }
    }
    const { query, detectChanges } = renderComponent(field)

    const input = query('input[type="checkbox"]').nativeElement as HTMLInputElement
    input.click()
    detectChanges()
    expect(field.formControl.value).toBe(true)
    expect(changeSpy).toHaveBeenCalledTimes(1)

    input.click()
    detectChanges()
    expect(field.formControl.value).toBe(false)
    expect(changeSpy).toHaveBeenCalledTimes(2)
  })
})
