import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { UserChangePasswordFormComponent } from './change-password.component'

describe('UserChangePasswordFormComponent', () => {
  it('retains required, minimum-length and matching validation and resets without emitting', () => {
    TestBed.configureTestingModule({ imports: [UserChangePasswordFormComponent, TranslateModule.forRoot()] })
    const fixture = TestBed.createComponent(UserChangePasswordFormComponent)
    const component = fixture.componentInstance
    const changed = jest.fn()
    component.registerOnChange(changed)
    fixture.detectChanges()
    expect(component.invalid).toBe(true)
    component.form.setValue({ password: 'short', confirmPassword: 'short' })
    expect(component.invalid).toBe(true)
    component.form.setValue({ password: 'test-only-value', confirmPassword: 'mismatch-value' })
    expect(component.form.hasError('mismatch')).toBe(true)
    component.form.setValue({ password: 'test-only-value', confirmPassword: 'test-only-value' })
    expect(component.invalid).toBe(false)
    changed.mockClear()
    component.writeValue({ password: '', confirmPassword: '' })
    expect(component.invalid).toBe(true)
    expect(changed).not.toHaveBeenCalled()
  })
})
