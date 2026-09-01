import { TestBed } from '@angular/core/testing'
import { Z_MODAL_DATA, ZardDialogRef } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
import { ToastrService } from '../../@core'
import { UsersOrganizationsService } from '../../@core/services/users-organizations.service'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectMembersDialogComponent } from './project-members-dialog.component'

describe('XpertProjectMembersDialogComponent', () => {
  const api = {
    members: jest.fn(() => of([])),
    invitations: jest.fn(() => of([])),
    invite: jest.fn()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    TestBed.configureTestingModule({
      imports: [XpertProjectMembersDialogComponent],
      providers: [
        { provide: ZardDialogRef, useValue: { close: jest.fn() } },
        {
          provide: Z_MODAL_DATA,
          useValue: {
            projectId: 'project-1',
            canTransferOwnership: false,
            canInviteOrganizationMembers: false
          }
        },
        { provide: XpertProjectApiService, useValue: api },
        { provide: UsersOrganizationsService, useValue: { getAllInOrg: jest.fn(() => of({ items: [] })) } },
        { provide: ToastrService, useValue: { error: jest.fn(), confirm: jest.fn() } }
      ]
    }).overrideComponent(XpertProjectMembersDialogComponent, {
      set: { imports: [], template: '' }
    })
  })

  it('does not send an external invitation without Organization invitation permission', async () => {
    const component = TestBed.createComponent(XpertProjectMembersDialogComponent).componentInstance
    component.inviteEmail.set('outside@example.com')

    await component.invite()

    expect(api.invite).not.toHaveBeenCalled()
  })
})
