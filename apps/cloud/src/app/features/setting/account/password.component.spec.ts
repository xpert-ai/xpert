import { HttpErrorResponse } from '@angular/common/http'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { UsersService } from '@cloud/app/@core/state'
import { TranslateModule } from '@ngx-translate/core'
import { of, Subject, throwError } from 'rxjs'
import { Store, ToastrService } from '../../../@core'
import { XpAccountPasswordComponent } from './password.component'

jest.mock('@cloud/app/@core/state', () => ({ UsersService: class UsersService {} }))
jest.mock('../../../@core', () => ({
  Store: class Store {},
  ToastrService: class ToastrService {},
  HttpStatus: { FORBIDDEN: 403 },
  getErrorMessage: (error: Error) => error.message
}))

describe('XpAccountPasswordComponent', () => {
  let fixture: ComponentFixture<XpAccountPasswordComponent>
  let component: XpAccountPasswordComponent
  let root: HTMLElement
  let password: jest.Mock
  let toastr: { success: jest.Mock; error: jest.Mock }

  beforeEach(async () => {
    password = jest.fn(() => of({}))
    toastr = { success: jest.fn(), error: jest.fn() }
    await TestBed.configureTestingModule({
      imports: [XpAccountPasswordComponent, TranslateModule.forRoot()],
      providers: [
        { provide: Store, useValue: { user$: of({ id: 'user-1', username: 'test-user', email: 'test@example.com' }) } },
        { provide: UsersService, useValue: { password } },
        { provide: ToastrService, useValue: toastr }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(XpAccountPasswordComponent)
    component = fixture.componentInstance
    root = fixture.nativeElement
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  })

  afterEach(() => TestBed.resetTestingModule())

  function input(key: 'hash' | 'password' | 'confirmPassword', value: string) {
    const field = root.querySelector<HTMLInputElement>(`#password-${key}`)
    field.value = value
    field.dispatchEvent(new Event('input'))
    field.dispatchEvent(new Event('blur'))
    fixture.detectChanges()
    return field
  }

  function validForm() {
    input('hash', 'old-value')
    input('password', 'new-value')
    input('confirmPassword', 'new-value')
  }

  it('starts without errors and associates labels, autofill hints and touched validation with the fields', async () => {
    expect(root.querySelectorAll('[role="alert"]')).toHaveLength(0)
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true)
    expect(root.querySelector<HTMLInputElement>('input[autocomplete="username"]').value).toBe('test-user')
    for (const key of ['hash', 'password', 'confirmPassword']) {
      expect(root.querySelector(`label[for="password-${key}"]`)).not.toBeNull()
      expect(root.querySelector<HTMLInputElement>(`#password-${key}`).type).toBe('password')
    }
    expect(root.querySelector('#password-hash').getAttribute('autocomplete')).toBe('current-password')
    expect(root.querySelector('#password-password').getAttribute('autocomplete')).toBe('new-password')
    input('hash', '')
    expect(root.querySelectorAll('[role="alert"]')).toHaveLength(1)
    expect(root.querySelector('#password-hash-error').textContent).toContain('XP.PasswordSettings.CurrentRequired')
    await component.resetPassword()
    fixture.detectChanges()
    expect(root.querySelectorAll('[role="alert"]')).toHaveLength(3)
    expect(password).not.toHaveBeenCalled()
    const clear = root.querySelector<HTMLButtonElement>('footer button[type="button"]')
    expect(clear.disabled).toBe(false)
    clear.click()
    fixture.detectChanges()
    expect(root.querySelectorAll('[role="alert"]')).toHaveLength(0)
    expect(clear.disabled).toBe(true)
  })

  it('preserves the eight-character minimum and revalidates matching when either new-password field changes', () => {
    input('hash', 'old-value')
    input('password', '1234567')
    input('confirmPassword', '1234567')
    expect(component.passwordForm.invalid).toBe(true)
    expect(root.querySelector('#password-password-error').textContent).toContain('XP.PasswordSettings.MinLength')
    input('password', '12345678')
    expect(root.querySelector('#password-confirmPassword-error').textContent).toContain('XP.PasswordSettings.MustMatch')
    input('confirmPassword', '12345678')
    expect(component.passwordForm.valid).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(false)
    input('password', '87654321')
    expect(component.passwordForm.invalid).toBe(true)
    expect(root.querySelector('#password-confirmPassword-error').textContent).toContain('XP.PasswordSettings.MustMatch')
    input('password', '12345678')
    expect(component.passwordForm.valid).toBe(true)
    expect(root.querySelector('#password-confirmPassword-error')).toBeNull()
    expect(password).not.toHaveBeenCalled()
  })

  it('toggles one field at a time and clears values, errors and visibility without making a request', () => {
    input('hash', 'old-value')
    input('password', 'short')
    const toggle = root.querySelector<HTMLButtonElement>('button[aria-controls="password-password"]')
    toggle.click()
    fixture.detectChanges()
    expect(root.querySelector<HTMLInputElement>('#password-password').type).toBe('text')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(root.querySelector<HTMLInputElement>('#password-hash').type).toBe('password')
    expect(root.querySelector<HTMLInputElement>('#password-password').value).toBe('short')
    component.clear()
    fixture.detectChanges()
    expect(component.passwordForm.getRawValue()).toEqual({ hash: '', password: '', confirmPassword: '' })
    expect(component.passwordForm.pristine).toBe(true)
    expect(root.querySelectorAll('[role="alert"]')).toHaveLength(0)
    expect(root.querySelector<HTMLInputElement>('#password-password').type).toBe('password')
    expect(password).not.toHaveBeenCalled()
  })

  it('sends only the existing self-password payload, blocks duplicate submits and clears the form after success', async () => {
    const pending = new Subject<object>()
    password.mockReturnValue(pending)
    validForm()
    component.toggleVisibility('password')
    const saving = component.resetPassword()
    fixture.detectChanges()
    expect(password).toHaveBeenCalledWith('user-1', { hash: 'old-value', password: 'new-value' })
    expect(root.querySelector('fieldset').disabled).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('button[aria-controls="password-password"]').disabled).toBe(true)
    component.clear()
    expect(component.passwordForm.controls.hash.value).toBe('old-value')
    await component.resetPassword()
    expect(password).toHaveBeenCalledTimes(1)
    pending.next({})
    pending.complete()
    await saving
    fixture.detectChanges()
    expect(component.loading()).toBe(false)
    expect(component.passwordForm.getRawValue()).toEqual({ hash: '', password: '', confirmPassword: '' })
    expect(component.passwordForm.pristine).toBe(true)
    expect(component.revealed().password).toBe(false)
    expect(root.querySelectorAll('[role="alert"]')).toHaveLength(0)
    expect(toastr.success).toHaveBeenCalledWith('XP.MESSAGE.PasswordChange', { Default: 'Password change' })
  })

  it('keeps the original 403 current-password error behavior and allows correction and retry', async () => {
    password.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403 })))
    validForm()
    await component.resetPassword()
    fixture.detectChanges()
    expect(toastr.error).toHaveBeenCalled()
    expect(root.querySelector('#password-hash-error').textContent).toContain('XP.PasswordSettings.CurrentRejected')
    expect(component.passwordForm.controls.password.value).toBe('new-value')
    expect(component.passwordForm.dirty).toBe(true)
    expect(component.loading()).toBe(false)
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true)
    input('hash', 'corrected-old-value')
    expect(root.querySelector('#password-hash-error')).toBeNull()
    expect(component.passwordForm.valid).toBe(true)
    password.mockReturnValue(of({}))
    await component.resetPassword()
    expect(password).toHaveBeenLastCalledWith('user-1', { hash: 'corrected-old-value', password: 'new-value' })
  })

  it('keeps inputs for retry after a non-403 failure without blaming the current password', async () => {
    password.mockReturnValue(throwError(() => new Error('Service unavailable')))
    validForm()
    await component.resetPassword()
    fixture.detectChanges()
    expect(toastr.error).toHaveBeenCalledWith('Service unavailable')
    expect(component.passwordForm.getRawValue()).toEqual({
      hash: 'old-value',
      password: 'new-value',
      confirmPassword: 'new-value'
    })
    expect(component.passwordForm.valid).toBe(true)
    expect(root.querySelector('#password-hash-error')).toBeNull()
    expect(component.loading()).toBe(false)
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(false)
  })
})
