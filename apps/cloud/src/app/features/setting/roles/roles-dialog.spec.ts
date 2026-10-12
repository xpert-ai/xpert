import { Dialog } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { EMPTY, of } from 'rxjs'
import { IRole, RolePermissionsService, RoleService, Store, ToastrService } from '../../../@core'
import { RolesComponent } from './roles.component'

describe('role dialogs', () => {
  let fixture: ComponentFixture<RolesComponent>
  const roles = {
    getAll: jest.fn(() => of({ items: [] })),
    create: jest.fn(() => of(null)),
    delete: jest.fn(() => of(null))
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RolesComponent, TranslateModule.forRoot()],
      providers: [
        { provide: RoleService, useValue: roles },
        { provide: RolePermissionsService, useValue: {} },
        { provide: Store, useValue: { user$: EMPTY } },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(RolesComponent)
    await settle()
  })

  afterEach(() => {
    TestBed.inject(Dialog).closeAll()
    fixture.destroy()
    jest.clearAllMocks()
  })

  async function settle() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  it.each([false, true])('deletes a role only when the dialog result is true (%s)', async (confirmed) => {
    const role: IRole = { id: 'reviewer', name: 'Research reviewer' }
    const pending = fixture.componentInstance.remove(role)
    await settle()
    const container = document.querySelector<HTMLElement>('[role="alertdialog"]')!
    expect(container).not.toBeNull()
    expect(roles.delete).not.toHaveBeenCalled()
    const action = confirmed ? 'action' : 'cancel'
    container.querySelector<HTMLButtonElement>(`[data-testid="z-alert-dialog-${action}"]`)!.click()
    await pending
    if (confirmed) expect(roles.delete).toHaveBeenCalledWith(role)
    else expect(roles.delete).not.toHaveBeenCalled()
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })

  it('rejects whitespace and creates a trimmed name only after confirmation', async () => {
    const pending = fixture.componentInstance.create()
    await settle()
    const container = document.querySelector<HTMLElement>('.cdk-dialog-container')!
    expect(document.getElementById(container.getAttribute('aria-labelledby')!)).not.toBeNull()
    const input = container.querySelector<HTMLInputElement>('input')!
    expect(document.activeElement).toBe(input)
    const submit = container.querySelectorAll<HTMLButtonElement>('footer button')[1]
    input.value = '   '
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(submit.disabled).toBe(true)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await settle()
    expect(roles.create).not.toHaveBeenCalled()
    input.value = ' Reviewer '
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(submit.disabled).toBe(false)
    submit.click()
    await pending
    expect(roles.create).toHaveBeenCalledWith({ name: 'Reviewer', rolePermissions: [] })
  })

  it('cancels from the shared corner button without creating a role', async () => {
    const pending = fixture.componentInstance.create()
    await settle()
    document.querySelector<HTMLButtonElement>('[xpDialogCloseButton]')!.click()
    await pending
    expect(roles.create).not.toHaveBeenCalled()
    expect(document.querySelector('.cdk-dialog-container')).toBeNull()
  })
})
