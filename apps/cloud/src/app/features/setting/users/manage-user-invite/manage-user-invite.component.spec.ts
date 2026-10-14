jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))
jest.mock('../users.component', () => ({ XpUsersComponent: class XpUsersComponent {} }))

import { Dialog } from '@angular/cdk/dialog'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { IInvite, InvitationTypeEnum, InviteStatusEnum, RolesEnum } from '@xpert-ai/contracts'
import { BehaviorSubject, defer, of, Subject } from 'rxjs'
import { InviteService, Store, ToastrService } from '@cloud/app/@core/state'
import { XpUsersComponent } from '../users.component'
import { ManageUserInviteComponent } from './manage-user-invite.component'

const organization = { id: 'org-1', name: 'Research' }
const invite = (id: string, overrides: Partial<IInvite> = {}): IInvite => ({
  id,
  token: 'test-token',
  email: `${id}@example.com`,
  invitedById: 'admin',
  roleId: 'role-1',
  status: InviteStatusEnum.INVITED,
  expireDate: new Date('2099-01-01'),
  createdAt: new Date('2026-01-01'),
  role: { name: RolesEnum.VIEWER },
  organization,
  invitedBy: { firstName: 'Admin' },
  ...overrides
})
const items = [
  invite('waiting'),
  invite('accepted', { status: InviteStatusEnum.ACCEPTED, expireDate: new Date('2000-01-01') }),
  invite('expired', { expireDate: new Date('2000-01-01') })
]

describe('ManageUserInviteComponent', () => {
  let fixture: ComponentFixture<ManageUserInviteComponent>
  let component: ManageUserInviteComponent
  let service: { getAll: jest.Mock; resendInvite: jest.Mock; delete: jest.Mock }
  let dialog: { open: jest.Mock }
  let invitedEvent: Subject<void>

  beforeEach(async () => {
    service = {
      getAll: jest.fn().mockResolvedValue({ items }),
      resendInvite: jest.fn().mockResolvedValue({}),
      delete: jest.fn()
    }
    dialog = { open: jest.fn(() => ({ closed: of(false) })) }
    invitedEvent = new Subject()
    await TestBed.configureTestingModule({
      imports: [ManageUserInviteComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: Store,
          useValue: {
            selectedOrganization$: new BehaviorSubject(organization),
            selectedOrganization: organization,
            user$: of({ tenantId: 'tenant-1' }),
            userId: 'admin'
          }
        },
        { provide: XpUsersComponent, useValue: { invitedEvent } },
        { provide: InviteService, useValue: service },
        { provide: Dialog, useValue: dialog },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(ManageUserInviteComponent)
    component = fixture.componentInstance
  })

  afterEach(() => TestBed.resetTestingModule())

  async function render() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  it('retains organization and tenant scope, derives expired status and filters locally without refetching', async () => {
    await render()
    expect(service.getAll).toHaveBeenCalledWith(['invitedBy', 'role', 'organization', 'organizationContact'], {
      organizationId: 'org-1',
      tenantId: 'tenant-1'
    })
    component.onStatusFilterChange('EXPIRED')
    await render()
    const root: HTMLElement = fixture.nativeElement
    expect(root.querySelector('tbody').textContent).toContain('expired@example.com')
    expect(root.querySelector('tbody').textContent).not.toContain('accepted@example.com')
    component.onStatusFilterChange(InviteStatusEnum.ACCEPTED)
    await render()
    expect(root.querySelector('tbody').textContent).toContain('accepted@example.com')
    expect(root.querySelector('[aria-label="XP.ACTIONS.Resend"]')).toBeNull()
    component.clearFilters()
    component.search = ' WAITING@EXAMPLE.COM '
    await render()
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1)
    expect(root.querySelector('tbody').textContent).toContain('waiting@example.com')
    expect(service.getAll).toHaveBeenCalledTimes(1)
  })

  it('retains sorting through filter changes and shows a distinct filtered empty state', async () => {
    await render()
    component.onSortChange('email', 'asc')
    await render()
    const root: HTMLElement = fixture.nativeElement
    expect(root.querySelector('tbody tr').textContent).toContain('accepted@example.com')
    component.search = 'not-found'
    await render()
    expect(root.textContent).toContain('XP.UserSettings.NoMatchingInvites')
    component.clearFilters()
    await render()
    expect(component.sortDirection('email')).toBe('asc')
    expect(root.querySelectorAll('tbody tr')).toHaveLength(3)
    expect(root.querySelector('tbody tr').textContent).toContain('accepted@example.com')
  })

  it('shows errors, retries and refreshes after invitations without resetting local filters', async () => {
    service.getAll.mockRejectedValueOnce(new Error('offline'))
    await render()
    const root: HTMLElement = fixture.nativeElement
    expect(root.querySelector('[role="alert"]')).not.toBeNull()
    component.search = 'waiting'
    component.refresh()
    await render()
    expect(root.querySelector('[role="alert"]')).toBeNull()
    expect(root.querySelectorAll('tbody tr')).toHaveLength(1)
    invitedEvent.next()
    await render()
    expect(service.getAll).toHaveBeenCalledTimes(3)
    expect(component.search).toBe('waiting')
  })

  it('keeps resend eligibility and its payload, and does not execute a cancelled deletion', async () => {
    await component.resendInvite(
      'accepted',
      'accepted@example.com',
      items[1].role,
      organization,
      InviteStatusEnum.ACCEPTED
    )
    expect(service.resendInvite).not.toHaveBeenCalled()
    await component.resendInvite('expired', 'expired@example.com', items[2].role, organization, 'EXPIRED')
    expect(service.resendInvite).toHaveBeenCalledWith({
      id: 'expired',
      email: 'expired@example.com',
      roleName: RolesEnum.VIEWER,
      organization,
      invitedById: 'admin',
      inviteType: InvitationTypeEnum.USER
    })
    const executeDelete = jest.fn(() => of({}))
    service.delete.mockReturnValue(defer(executeDelete))
    await component.deleteInvite('waiting', 'waiting@example.com')
    expect(dialog.open).toHaveBeenCalled()
    expect(executeDelete).not.toHaveBeenCalled()
  })
})
