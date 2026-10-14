jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

import { signal } from '@angular/core'
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { IUser, RolesEnum } from '@xpert-ai/contracts'
import { BehaviorSubject, of } from 'rxjs'
import { ToastrService, UsersService } from '@cloud/app/@core/state'
import { XpertAPIService } from '../../../../@core'
import { XpEditUserComponent } from '../edit-user/edit-user.component'
import { UserBasicComponent } from './user-basic.component'

describe('UserBasicComponent', () => {
  let fixture: ComponentFixture<UserBasicComponent>
  let component: UserBasicComponent
  let currentUser: ReturnType<typeof signal<IUser>>
  let userId$: BehaviorSubject<string>
  let update: jest.Mock
  let reloadUser: jest.Mock
  let getByPrincipalUser: jest.Mock

  beforeEach(async () => {
    currentUser = signal<IUser>({
      id: 'user-1',
      firstName: 'Admin',
      email: 'first@example.com',
      username: 'admin',
      roleId: 'role-admin',
      role: { id: 'role-admin', name: RolesEnum.SUPER_ADMIN }
    })
    userId$ = new BehaviorSubject('user-1')
    update = jest.fn().mockResolvedValue({})
    reloadUser = jest.fn()
    getByPrincipalUser = jest.fn().mockReturnValue(of({ id: 'xpert-1', name: 'linked-xpert' }))
    await TestBed.configureTestingModule({
      imports: [UserBasicComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: XpEditUserComponent,
          useValue: {
            userId$,
            user: currentUser,
            roles: signal([{ id: 'role-admin', name: RolesEnum.SUPER_ADMIN }]),
            isTenantScope: signal(false),
            roleLabel: () => currentUser().role?.name,
            reloadUser
          }
        },
        { provide: UsersService, useValue: { update } },
        { provide: XpertAPIService, useValue: { getByPrincipalUser } },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(UserBasicComponent)
    component = fixture.componentInstance
  })

  it('shows organization read-only details as text, with the resolved role and correct reason', () => {
    fixture.componentRef.setInput('readOnly', true)
    fixture.detectChanges()
    const root: HTMLElement = fixture.nativeElement
    expect(root.querySelectorAll('input, z-combobox')).toHaveLength(0)
    expect(root.textContent).toContain('XP.UserDetail.OrganizationReadOnlyHint')
    expect(root.textContent).toContain('SUPER_ADMIN')
    expect(root.textContent).not.toContain('XP.Users.TechnicalUserReadonlyHint')
  })

  it('loads the linked assistant only for technical users', fakeAsync(() => {
    fixture.detectChanges()
    tick()
    expect(getByPrincipalUser).not.toHaveBeenCalled()
    fixture.componentRef.setInput('readOnly', true)
    fixture.componentRef.setInput('showLinkedXpert', true)
    fixture.detectChanges()
    tick()
    expect(getByPrincipalUser).toHaveBeenCalledWith('user-1')
    expect(component.linkedXpert()).toMatchObject({ id: 'xpert-1' })
    expect(fixture.nativeElement.textContent).toContain('XP.Users.TechnicalUserReadonlyHint')
  }))

  it('retains the latest loaded user id independently of form values and refreshes the identity after saving', async () => {
    fixture.componentRef.setInput('allowRoleChange', true)
    fixture.detectChanges()
    userId$.next('user-2')
    currentUser.set({ ...currentUser(), id: 'user-2', email: 'latest@example.com' })
    fixture.detectChanges()
    component.form.controls.firstName.setValue('Updated')
    component.form.markAsDirty()
    await component.save()
    expect(update).toHaveBeenCalledWith(
      'user-2',
      expect.objectContaining({ firstName: 'Updated', email: 'latest@example.com', roleId: 'role-admin' })
    )
    expect(component.form.pristine).toBe(true)
    expect(reloadUser).toHaveBeenCalledTimes(1)
  })

  it('does not send a role change without the existing role-change permission', async () => {
    fixture.componentRef.setInput('allowRoleChange', false)
    fixture.detectChanges()
    component.form.patchValue({ firstName: 'Changed', roleId: 'another-role' })
    component.form.markAsDirty()
    await component.save()
    expect(component.form.controls.roleId.disabled).toBe(true)
    expect(update).toHaveBeenCalledWith('user-1', expect.not.objectContaining({ roleId: expect.anything() }))
  })

  it('blocks read-only, pristine, and invalid submissions', async () => {
    fixture.detectChanges()
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true)
    await component.save()
    component.form.controls.email.setValue('invalid-email')
    component.form.markAsDirty()
    await component.save()
    expect(component.form.controls.email.touched).toBe(true)
    fixture.componentRef.setInput('readOnly', true)
    fixture.detectChanges()
    await component.save()
    expect(update).not.toHaveBeenCalled()
  })

  it('resets dirty fields back to the loaded user', () => {
    fixture.detectChanges()
    component.form.controls.firstName.setValue('Unsaved')
    component.form.markAsDirty()
    expect(component.hasChanges()).toBe(true)
    component.reset()
    expect(component.form.controls.firstName.value).toBe('Admin')
    expect(component.hasChanges()).toBe(false)
  })
})
