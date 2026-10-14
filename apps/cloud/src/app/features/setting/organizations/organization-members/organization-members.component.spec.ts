import { Dialog } from '@angular/cdk/dialog'
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { of, throwError } from 'rxjs'
import { ToastrService, UsersOrganizationsService } from '../../../../@core'
import { OrganizationMembersComponent } from './organization-members.component'

jest.mock('@milkdown/crepe', () => ({
  Crepe: class {
    static Feature = {}
  }
}))

describe('OrganizationMembersComponent', () => {
  const service = { getAll: jest.fn(), update: jest.fn(), create: jest.fn(), removeUserFromOrg: jest.fn() }
  const open = jest.fn()

  beforeEach(async () => {
    jest.clearAllMocks()
    service.getAll.mockReturnValue(of({ items: [] }))
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), OrganizationMembersComponent],
      providers: [
        { provide: UsersOrganizationsService, useValue: service },
        { provide: Dialog, useValue: { open } },
        { provide: ToastrService, useValue: { success: jest.fn(), error: jest.fn() } }
      ]
    })
      .overrideComponent(OrganizationMembersComponent, { set: { template: '' } })
      .compileComponents()
  })

  it('recovers from a failed request on refresh without terminating the member stream', () => {
    service.getAll.mockReturnValueOnce(throwError(() => new Error('Unavailable')))
    const fixture = TestBed.createComponent(OrganizationMembersComponent)
    const component = fixture.componentInstance
    component.organizationId = 'organization-1'
    expect(component.loadFailed()).toBe(true)
    expect(component.loading()).toBe(false)
    component.refresh()
    expect(service.getAll).toHaveBeenCalledTimes(2)
    expect(component.loadFailed()).toBe(false)
    expect(component.memberships()).toEqual([])
  })

  it('does not open the member selector in read-only mode', async () => {
    const fixture = TestBed.createComponent(OrganizationMembersComponent)
    fixture.componentInstance.organizationId = 'organization-1'
    await fixture.componentInstance.openMemberSelect()
    expect(open).not.toHaveBeenCalled()
    expect(service.create).not.toHaveBeenCalled()
  })
})
