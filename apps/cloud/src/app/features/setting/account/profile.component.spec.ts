import { ComponentFixture, TestBed } from '@angular/core/testing'
import { UsersService } from '@cloud/app/@core/state'
import { TranslateModule } from '@ngx-translate/core'
import { IUser, LanguagesEnum } from '@xpert-ai/contracts'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { RoleService, Store, ToastrService } from '../../../@core'
import { XpAccountProfileComponent } from './profile.component'

jest.mock('@cloud/app/@core/state', () => ({ UsersService: class UsersService {} }))
jest.mock('../../../@core', () => ({
  Store: class Store {},
  RoleService: class RoleService {},
  ToastrService: class ToastrService {},
  LANGUAGES: [
    { value: 'zh-Hans', label: '简体中文' },
    { value: 'zh-Hant', label: '繁体中文' },
    { value: 'en', label: 'English' }
  ],
  getErrorMessage: (error: Error) => error.message
}))
jest.mock('../../../@shared/pipes', () => ({
  CreatedByPipe: jest.requireActual('../../../@shared/pipes/created-by.pipe').CreatedByPipe
}))

describe('XpAccountProfileComponent', () => {
  let fixture: ComponentFixture<XpAccountProfileComponent>
  let component: XpAccountProfileComponent
  let root: HTMLElement
  let users: BehaviorSubject<IUser>
  let updateMe: jest.Mock
  let toastr: { success: jest.Mock; error: jest.Mock }

  const initialUser: IUser = {
    id: 'user-1',
    firstName: 'Lin',
    lastName: 'Chen',
    username: 'lin',
    email: 'lin@example.com',
    imageUrl: 'https://example.com/avatar.png',
    preferredLanguage: LanguagesEnum.SimplifiedChinese,
    timeZone: 'Asia/Shanghai',
    roleId: 'role-1',
    thirdPartyId: 'external-1',
    tags: []
  }

  beforeEach(async () => {
    users = new BehaviorSubject<IUser>({ ...initialUser })
    updateMe = jest.fn(() => of({ ...initialUser }))
    toastr = { success: jest.fn(), error: jest.fn() }
    await TestBed.configureTestingModule({
      imports: [XpAccountProfileComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: Store,
          useValue: {
            user$: users.asObservable(),
            get user() {
              return users.value
            },
            set user(user: IUser) {
              users.next(user)
            }
          }
        },
        { provide: UsersService, useValue: { updateMe } },
        { provide: RoleService, useValue: { getAll: () => of({ items: [{ id: 'role-1', name: 'Viewer' }] }) } },
        { provide: ToastrService, useValue: toastr }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(XpAccountProfileComponent)
    component = fixture.componentInstance
    root = fixture.nativeElement
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  })

  afterEach(() => TestBed.resetTestingModule())

  function input(id: string, value: string) {
    const field = root.querySelector<HTMLInputElement>(`#${id}`)
    field.value = value
    field.dispatchEvent(new Event('input'))
    field.dispatchEvent(new Event('blur'))
    fixture.detectChanges()
  }

  it('keeps account-managed fields read-only and requires a username before saving', async () => {
    expect(root.querySelector<HTMLInputElement>('#profile-email').disabled).toBe(true)
    expect(root.querySelector('[data-profile-role]').textContent.trim()).toBe('Viewer')
    expect(root.textContent).toContain('external-1')
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true)
    input('profile-username', '')
    expect(root.querySelector('[role="alert"]').textContent).toContain('XP.ProfileSettings.UsernameRequired')
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true)
    await component.save()
    expect(updateMe).not.toHaveBeenCalled()
  })

  it('saves the existing profile payload and merges non-null response fields without changing authorization', async () => {
    input('profile-first-name', 'New name')
    input('profile-username', 'new-username')
    component.form.controls.preferredLanguage.setValue(LanguagesEnum.English)
    component.form.controls.timeZone.setValue('Europe/London')
    updateMe.mockReturnValue(
      of({
        firstName: 'New name',
        username: 'new-username',
        preferredLanguage: LanguagesEnum.English,
        timeZone: 'Europe/London',
        email: null
      })
    )
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(false)
    await component.save()
    fixture.detectChanges()
    expect(updateMe).toHaveBeenCalledWith({
      email: initialUser.email,
      firstName: 'New name',
      lastName: initialUser.lastName,
      tags: initialUser.tags,
      username: 'new-username',
      imageUrl: initialUser.imageUrl,
      preferredLanguage: LanguagesEnum.English,
      timeZone: 'Europe/London'
    })
    expect(updateMe.mock.calls[0][0]).not.toHaveProperty('roleId')
    expect(updateMe.mock.calls[0][0]).not.toHaveProperty('thirdPartyId')
    expect(users.value.email).toBe(initialUser.email)
    expect(users.value.roleId).toBe(initialUser.roleId)
    expect(component.form.pristine).toBe(true)
    expect(toastr.success).toHaveBeenCalled()
  })

  it('resets edits and validation to the latest saved profile without sending an update', () => {
    input('profile-username', '')
    input('profile-first-name', 'Unsaved')
    component.reset()
    fixture.detectChanges()
    expect(component.form.getRawValue().firstName).toBe(initialUser.firstName)
    expect(component.form.getRawValue().username).toBe(initialUser.username)
    expect(component.form.pristine).toBe(true)
    expect(component.form.untouched).toBe(true)
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(updateMe).not.toHaveBeenCalled()
    users.next({ ...initialUser, imageUrl: 'https://example.com/new-avatar.png' })
    fixture.detectChanges()
    expect(component.form.controls.imageUrl.value).toBe('https://example.com/new-avatar.png')
  })

  it('prevents duplicate submissions and keeps edits available after a failed save', async () => {
    const pending = new Subject<IUser>()
    updateMe.mockReturnValue(pending)
    input('profile-first-name', 'Unsaved name')
    const saving = component.save()
    fixture.detectChanges()
    expect(root.querySelector('fieldset').disabled).toBe(true)
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(true)
    await component.save()
    component.reset()
    expect(updateMe).toHaveBeenCalledTimes(1)
    expect(component.form.controls.firstName.value).toBe('Unsaved name')
    pending.error(new Error('Save failed'))
    await saving
    fixture.detectChanges()
    expect(toastr.error).toHaveBeenCalledWith('Save failed')
    expect(component.form.dirty).toBe(true)
    expect(component.form.controls.firstName.value).toBe('Unsaved name')
    expect(component.saving()).toBe(false)
    expect(root.querySelector<HTMLButtonElement>('button[type="submit"]').disabled).toBe(false)
    expect(users.value.firstName).toBe(initialUser.firstName)
    updateMe.mockReturnValue(of({ ...initialUser, firstName: 'Unsaved name' }))
    await component.save()
    expect(users.value.firstName).toBe('Unsaved name')
  })
})
