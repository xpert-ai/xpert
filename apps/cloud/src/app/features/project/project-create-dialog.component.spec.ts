import { TestBed } from '@angular/core/testing'
import { Z_MODAL_DATA, ZardDialogRef } from '@xpert-ai/headless-ui'
import { of } from 'rxjs'
import { UsersOrganizationsService } from '../../@core/services/users-organizations.service'
import { Store } from '../../@core'
import { XpertProjectCreateDialogComponent } from './project-create-dialog.component'

describe('XpertProjectCreateDialogComponent', () => {
  it('creates an organization-scoped project without workspace or assistant resources', () => {
    const dialogRef = { close: jest.fn() }

    TestBed.configureTestingModule({
      imports: [XpertProjectCreateDialogComponent],
      providers: [
        { provide: ZardDialogRef, useValue: dialogRef },
        { provide: Z_MODAL_DATA, useValue: null },
        { provide: Store, useValue: { userId: 'owner-1' } },
        { provide: UsersOrganizationsService, useValue: { getAllInOrg: jest.fn(() => of({ items: [] })) } }
      ]
    }).overrideComponent(XpertProjectCreateDialogComponent, {
      set: { imports: [], template: '' }
    })

    const component = TestBed.createComponent(XpertProjectCreateDialogComponent).componentInstance
    component.form.patchValue({
      name: 'Launch project',
      description: 'Ship the launch',
      managementMode: 'advanced'
    })

    component.submit()

    expect(dialogRef.close).toHaveBeenCalledWith({
      name: 'Launch project',
      description: 'Ship the launch',
      status: 'active',
      settings: { managementMode: 'advanced' }
    })
    expect(dialogRef.close.mock.calls[0][0]).not.toHaveProperty('workspaceId')
    expect(dialogRef.close.mock.calls[0][0]).not.toHaveProperty('xpertIds')
    expect(dialogRef.close.mock.calls[0][0]).not.toHaveProperty('toolsetIds')
    expect(dialogRef.close.mock.calls[0][0]).not.toHaveProperty('knowledgebaseIds')
  })

  it('includes each selected non-owner member once in the create payload', () => {
    const dialogRef = { close: jest.fn() }

    TestBed.configureTestingModule({
      imports: [XpertProjectCreateDialogComponent],
      providers: [
        { provide: ZardDialogRef, useValue: dialogRef },
        { provide: Z_MODAL_DATA, useValue: null },
        { provide: Store, useValue: { userId: 'owner-1' } },
        { provide: UsersOrganizationsService, useValue: { getAllInOrg: jest.fn(() => of({ items: [] })) } }
      ]
    }).overrideComponent(XpertProjectCreateDialogComponent, {
      set: { imports: [], template: '' }
    })

    const component = TestBed.createComponent(XpertProjectCreateDialogComponent).componentInstance
    component.form.patchValue({
      name: 'Launch project',
      memberIds: [
        { id: 'member-1', email: 'member@example.com' },
        { id: 'member-1', email: 'member@example.com' },
        { id: 'owner-1', email: 'owner@example.com' }
      ]
    })

    component.submit()

    expect(dialogRef.close).toHaveBeenCalledWith(
      expect.objectContaining({ memberIds: ['member-1'] })
    )
  })
})
