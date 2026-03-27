import { Component, NgModule } from '@angular/core'
import { By } from '@angular/platform-browser'
import { FormGroup, ReactiveFormsModule } from '@angular/forms'
import { FormlyFieldConfig, FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { throwError } from 'rxjs'
import { ZardComboboxComponent } from '@xpert-ai/headless-ui/components/combobox'
import { ZardSelectComponent } from '@xpert-ai/headless-ui/components/select'
import { PACFormlySelectModule } from './select.module'

const { TestBed } = require('@angular/core/testing')
const { NoopAnimationsModule } = require('@angular/platform-browser/animations')

@Component({
  selector: 'formly-select-test-host',
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
  imports: [ReactiveFormsModule, TranslateModule.forRoot(), FormlyModule.forRoot(), PACFormlySelectModule]
})
class TestSelectModule {}

const setTranslations = () => {
  const translate = TestBed.inject(TranslateService)
  translate.setTranslation(
    'en',
    {
      FORMLY: {
        Select: {
          Empty: 'No results found.',
          UnableLoadOptionList: 'Unable to load option list'
        },
        COMMON: {
          Help: 'Help',
          NotFoundValue: 'Not found value: '
        }
      }
    },
    true
  )
  translate.use('en')
}

const renderComponent = (field: FormlyFieldConfig, model: Record<string, unknown> = {}) => {
  const fixture = TestBed.configureTestingModule({
    imports: [NoopAnimationsModule, TestSelectModule]
  }).createComponent(HostComponent)

  setTranslations()
  fixture.componentInstance.model = model
  fixture.componentInstance.fields = [field]
  fixture.detectChanges()

  return {
    fixture,
    field,
    detectChanges: () => fixture.detectChanges(),
    nativeText: () => fixture.nativeElement.textContent as string,
    query: (selector: string) => fixture.debugElement.query(By.css(selector))
  }
}

describe('formly: Select Type', () => {
  it('should render z-select for non-searchable fields', () => {
    const { query } = renderComponent({
      key: 'name',
      type: 'select',
      props: {
        options: [{ value: 'a', label: 'Option A' }]
      }
    })

    expect(query('z-select')).not.toBeNull()
    expect(query('z-combobox')).toBeNull()
  })

  it('should render z-combobox for searchable fields', () => {
    const { query } = renderComponent({
      key: 'name',
      type: 'select',
      props: {
        searchable: true,
        options: [{ value: 'a', label: 'Option A' }]
      }
    })

    expect(query('z-combobox')).not.toBeNull()
    expect(query('z-select')).toBeNull()
  })

  it('should bind control value on selection change', () => {
    const field: FormlyFieldConfig = {
      key: 'name',
      type: 'select',
      props: {
        options: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' }
        ]
      }
    }
    const { fixture, detectChanges } = renderComponent(field)

    const select = fixture.debugElement.query(By.directive(ZardSelectComponent)).componentInstance as ZardSelectComponent
    select.selectItem('b', 'Option B')
    detectChanges()

    expect(field.formControl.value).toBe('b')
  })

  it('should show an error when options observable fails', async () => {
    const field: FormlyFieldConfig = {
      key: 'name',
      type: 'select',
      props: {
        options: throwError(() => new Error('failed to load'))
      }
    }
    const { fixture, detectChanges, nativeText } = renderComponent(field)

    await fixture.whenStable()
    detectChanges()

    expect(nativeText()).toContain('Unable to load option list')
  })

  it('should show not found value when current value is missing from options', () => {
    const { detectChanges, nativeText } = renderComponent(
      {
        key: 'name',
        type: 'select',
        props: {
          options: [{ value: 'a', label: 'Option A' }]
        }
      },
      { name: 'missing' }
    )

    detectChanges()

    expect(nativeText()).toContain('Not found value: missing')
  })

  it('should register ngm-select alias', () => {
    const { query } = renderComponent({
      key: 'name',
      type: 'ngm-select',
      props: {
        options: [{ value: 'a', label: 'Option A' }]
      }
    })

    expect(query('z-select')).not.toBeNull()
  })

  it('should instantiate searchable alias with z-combobox', () => {
    const { fixture } = renderComponent({
      key: 'name',
      type: 'ngm-select',
      props: {
        searchable: true,
        options: [{ value: 'a', label: 'Option A' }]
      }
    })

    const combobox = fixture.debugElement.query(By.directive(ZardComboboxComponent))
    expect(combobox).not.toBeNull()
  })
})
