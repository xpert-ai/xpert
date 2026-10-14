import { TestBed } from '@angular/core/testing'
import { ActivatedRoute } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, of } from 'rxjs'
import { CustomSmtpService, Store, ToastrService } from '../../@core/services'
import { SMTPComponent } from './smtp.component'

describe('SMTP settings', () => {
  const user$ = new BehaviorSubject({ id: 'user', tenantId: 'tenant' })
  const organization$ = new BehaviorSubject({ id: 'org', name: 'Organization' })
  const route$ = new BehaviorSubject({ isOrganization: false })
  const smtp = {
    getSMTPSetting: jest.fn(),
    saveSMTPSetting: jest.fn(),
    updateSMTPSetting: jest.fn(),
    validateSMTPSetting: jest.fn()
  }
  beforeEach(() => {
    jest.clearAllMocks()
    route$.next({ isOrganization: false })
    smtp.getSMTPSetting.mockResolvedValue({ host: 'mail.example.com', port: 587, secure: false, isValidate: false })
    smtp.saveSMTPSetting.mockResolvedValue({})
    smtp.updateSMTPSetting.mockResolvedValue({})
    smtp.validateSMTPSetting.mockResolvedValue(true)
    TestBed.configureTestingModule({
      imports: [SMTPComponent, TranslateModule.forRoot()],
      providers: [
        { provide: ActivatedRoute, useValue: { data: route$ } },
        { provide: CustomSmtpService, useValue: smtp },
        {
          provide: Store,
          useValue: { user$, selectedOrganization$: organization$, selectedOrganization: organization$.value }
        },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } }
      ]
    })
  })
  async function render() {
    const fixture = TestBed.createComponent(SMTPComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return fixture
  }
  it('resolves tenant and organization scope independently of the selected organization', async () => {
    const fixture = await render()
    expect(smtp.getSMTPSetting).toHaveBeenLastCalledWith({ tenantId: 'tenant' })
    route$.next({ isOrganization: true })
    await fixture.whenStable()
    expect(smtp.getSMTPSetting).toHaveBeenLastCalledWith({ tenantId: 'tenant', organizationId: 'org' })
    expect(fixture.componentInstance.form.value.organizationId).toBe('org')
  })
  it('requires validation before saving and serializes the validation result as a boolean', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    expect(fixture.nativeElement.querySelector('footer button[type=button]').disabled).toBe(false)
    component.form.markAsDirty()
    component.onSubmit()
    expect(smtp.saveSMTPSetting).not.toHaveBeenCalled()
    await component.validateSmtp()
    component.onSubmit()
    expect(smtp.saveSMTPSetting).toHaveBeenCalledWith(expect.objectContaining({ isValidate: true }))
    await fixture.whenStable()
  })
  it('invalidates connection verification when the secure switch changes and masks the password', async () => {
    const fixture = await render()
    const component = fixture.componentInstance
    await component.validateSmtp()
    fixture.detectChanges()
    const element: HTMLElement = fixture.nativeElement
    element.querySelector<HTMLButtonElement>('[role="switch"]').click()
    fixture.detectChanges()
    expect(component.isValidated()).toBe(false)
    expect(component.form.value.secure).toBe(true)
    expect(element.querySelector<HTMLInputElement>('#smtp-password').type).toBe('password')
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true)
  })
})
