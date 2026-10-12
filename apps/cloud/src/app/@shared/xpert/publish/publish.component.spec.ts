import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog'
import { Component, forwardRef, input } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { FormControl, FormGroup, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IIntegration, IntegrationService, ToastrService, XpertAPIService } from '../../../@core'
import { IntegrationFormComponent } from '../../integration'
import { XpertPublishComponent } from './publish.component'
import { of } from 'rxjs'

@Component({
  standalone: true,
  selector: 'test-integration-form',
  template: '',
  providers: [{ provide: IntegrationFormComponent, useExisting: forwardRef(() => IntegrationFormStub) }]
})
class IntegrationFormStub {
  integration = input<IIntegration>()
  formGroup = new FormGroup({ name: new FormControl('', Validators.required), options: new FormGroup({}) })
}

describe('XpertPublishComponent footer submission', () => {
  it('uses the currently selected form and preserves validation, busy state and publish payload', async () => {
    const publishIntegration = jest.fn(() => of({ id: 'saved', name: 'Saved' }))
    await TestBed.configureTestingModule({
      imports: [XpertPublishComponent, TranslateModule.forRoot()],
      providers: [
        { provide: DIALOG_DATA, useValue: { xpert: { id: 'assistant-1' } } },
        { provide: DialogRef, useValue: { close: jest.fn() } },
        { provide: Dialog, useValue: { open: jest.fn() } },
        { provide: IntegrationService, useValue: { getProviders: () => of([]) } },
        { provide: XpertAPIService, useValue: { getById: () => of({ integrations: [] }), publishIntegration } },
        { provide: ToastrService, useValue: { success: jest.fn(), danger: jest.fn() } }
      ]
    })
      .overrideComponent(XpertPublishComponent, {
        set: {
          imports: [IntegrationFormStub],
          template: '@for (item of selectedIntegrations(); track item) {<test-integration-form [integration]="item" />}'
        }
      })
      .compileComponents()
    const fixture = TestBed.createComponent(XpertPublishComponent)
    fixture.detectChanges()
    const component = fixture.componentInstance
    component.saveSelectedIntegration()
    expect(publishIntegration).not.toHaveBeenCalled()
    component.selectIntegration({ id: 'a', name: 'First' } as IIntegration)
    fixture.detectChanges()
    const first = component.integrationForm().formGroup
    first.patchValue({ name: 'First' })
    component.saveSelectedIntegration()
    expect(publishIntegration).not.toHaveBeenCalled()
    first.markAsDirty()
    component.selectIntegration({ id: 'b', name: 'Second' } as IIntegration)
    fixture.detectChanges()
    const current = component.integrationForm().formGroup
    expect(current).not.toBe(first)
    current.markAsDirty()
    component.saveSelectedIntegration()
    expect(publishIntegration).not.toHaveBeenCalled()
    current.patchValue({ name: 'Second' })
    component.loading.set(true)
    component.saveSelectedIntegration()
    expect(publishIntegration).not.toHaveBeenCalled()
    component.loading.set(false)
    component.saveSelectedIntegration()
    expect(publishIntegration).toHaveBeenCalledWith('assistant-1', {
      name: 'Second',
      options: { xpertId: 'assistant-1' }
    })
    expect(component.loading()).toBe(false)
  })
})
