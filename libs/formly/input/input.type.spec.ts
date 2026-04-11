import { Component, NgModule } from '@angular/core'
import { FormGroup, ReactiveFormsModule } from '@angular/forms'
import { By } from '@angular/platform-browser'
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardComboboxDeprecatedComponent } from '@xpert-ai/headless-ui/components/combobox-deprecated'
import { PACFormlyInputModule } from './input.module'

const { TestBed } = require('@angular/core/testing')
const { NoopAnimationsModule } = require('@angular/platform-browser/animations')

@Component({
  selector: 'formly-input-test-host',
  standalone: false,
  template: ` <formly-form [form]="form" [model]="model" [fields]="fields"></formly-form> `
})
class HostComponent {
  readonly form = new FormGroup({})
  model: Record<string, unknown> = {}
  fields: FormlyFieldConfig[] = []
}

@NgModule({
  declarations: [HostComponent],
  imports: [ReactiveFormsModule, TranslateModule.forRoot(), FormlyModule.forRoot(), PACFormlyInputModule]
})
class TestInputModule {}

const setTranslations = () => {
  const translate = TestBed.inject(TranslateService)
  translate.setTranslation(
    'en',
    {
      FORMLY: {
        COMMON: {
          Help: 'Help'
        }
      }
    },
    true
  )
  translate.use('en')
}

const renderComponent = (field: FormlyFieldConfig, model: Record<string, unknown> = {}) => {
  const fixture = TestBed.configureTestingModule({
    imports: [NoopAnimationsModule, TestInputModule]
  }).createComponent(HostComponent)

  setTranslations()
  fixture.componentInstance.model = model
  fixture.componentInstance.fields = [field]
  fixture.detectChanges()

  return {
    fixture,
    field,
    detectChanges: () => fixture.detectChanges(),
    query: (selector: string) => fixture.debugElement.query(By.css(selector))
  }
}

describe('formly: Input Type', () => {
  it('should render z-input for plain input fields without ngm-input', () => {
    const { query } = renderComponent({
      key: 'name',
      type: 'input',
      props: {
        label: 'Name'
      }
    })

    expect(query('ngm-input')).toBeNull()
    expect(query('z-combobox-deprecated')).toBeNull()
    expect(query('input[z-input]')).not.toBeNull()
  })

  it('should render z-combobox-deprecated when options are provided', () => {
    const { fixture, query } = renderComponent({
      key: 'name',
      type: 'input',
      props: {
        options: [{ value: 'a', label: 'Option A' }]
      }
    })

    expect(query('ngm-input')).toBeNull()
    expect(fixture.debugElement.query(By.directive(ZardComboboxDeprecatedComponent))).not.toBeNull()
  })

  it('should defer form control updates until blur', () => {
    const field: FormlyFieldConfig = {
      key: 'name',
      type: 'input'
    }

    const { query, detectChanges } = renderComponent(field, { name: 'before' })
    const input = query('input[z-input]').nativeElement as HTMLInputElement

    input.value = 'after'
    input.dispatchEvent(new Event('input'))
    detectChanges()

    expect(field.formControl.value).toBe('before')
    expect(field.formControl.dirty).toBe(false)

    input.dispatchEvent(new FocusEvent('blur'))
    detectChanges()

    expect(field.formControl.value).toBe('after')
    expect(field.formControl.dirty).toBe(true)
  })

  it('should disable the rendered control when readonly is set', () => {
    const field: FormlyFieldConfig = {
      key: 'name',
      type: 'input',
      props: {
        readonly: true
      }
    }

    const { query } = renderComponent(field)
    const input = query('input[z-input]').nativeElement as HTMLInputElement

    expect(field.formControl.disabled).toBe(true)
    expect(input.disabled).toBe(true)
  })

  it('should render help link and validation message', () => {
    const field: FormlyFieldConfig = {
      key: 'name',
      type: 'input',
      props: {
        label: 'Name',
        required: true,
        help: 'https://example.com/help'
      }
    }

    const { query, detectChanges } = renderComponent(field)
    const inputDebugElement = query('input[z-input]')

    inputDebugElement.triggerEventHandler('focus', new FocusEvent('focus'))
    detectChanges()

    expect(query('a[href="https://example.com/help"]')).not.toBeNull()
    expect(query('formly-validation-message')).not.toBeNull()
  })
})
