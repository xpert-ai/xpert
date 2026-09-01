import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { CurrentUserHydrationService } from '../../@core/state'
import { ScopeService } from '../../@core'
import { of } from 'rxjs'
import { XpertProjectApiService } from './project-api.service'
import { XpertProjectInvitationAcceptComponent } from './project-invitation-accept.component'

describe(XpertProjectInvitationAcceptComponent.name, () => {
  const organization = { id: 'organization-2', name: 'Target Organization' }
  const api = {
    acceptInvitation: jest.fn(),
    declineInvitation: jest.fn()
  }
  const router = { navigate: jest.fn() }
  const hydration = { getFeatureHydration: jest.fn() }
  const scope = { switchToOrganization: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    api.acceptInvitation.mockReturnValue(
      of({ projectId: 'project-1', organizationId: organization.id, userId: 'user-1', role: 'member' })
    )
    hydration.getFeatureHydration.mockResolvedValue({
      organizations: [{ organizationId: organization.id, organization }]
    })
    scope.switchToOrganization.mockResolvedValue(true)
    router.navigate.mockResolvedValue(true)

    TestBed.configureTestingModule({
      imports: [XpertProjectInvitationAcceptComponent, TranslateModule.forRoot()],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: { get: jest.fn(() => 'invitation-token') } } }
        },
        { provide: Router, useValue: router },
        { provide: XpertProjectApiService, useValue: api },
        { provide: CurrentUserHydrationService, useValue: hydration },
        { provide: ScopeService, useValue: scope }
      ]
    })
  })

  it('refreshes memberships and switches to the Project Organization before navigation', async () => {
    const fixture = TestBed.createComponent(XpertProjectInvitationAcceptComponent)

    await fixture.componentInstance.accept()

    expect(hydration.getFeatureHydration).toHaveBeenCalledWith({ force: true, skipSessionCache: true })
    expect(scope.switchToOrganization).toHaveBeenCalledWith(organization)
    expect(scope.switchToOrganization.mock.invocationCallOrder[0]).toBeLessThan(
      router.navigate.mock.invocationCallOrder[0]
    )
    expect(router.navigate).toHaveBeenCalledWith(['/project', 'project-1'])
  })

  it('retries post-acceptance hydration and navigation without accepting the invitation again', async () => {
    hydration.getFeatureHydration.mockResolvedValue({ organizations: [] })
    const fixture = TestBed.createComponent(XpertProjectInvitationAcceptComponent)

    await fixture.componentInstance.accept()

    expect(fixture.componentInstance.acceptedMembership()).toMatchObject({ projectId: 'project-1' })
    expect(scope.switchToOrganization).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
    expect(fixture.componentInstance.error()).toBe('XP.XProject.ProjectInvitationOrganizationUnavailable')

    hydration.getFeatureHydration.mockResolvedValue({
      organizations: [{ organizationId: organization.id, organization }]
    })
    await fixture.componentInstance.continueToProject()

    expect(api.acceptInvitation).toHaveBeenCalledTimes(1)
    expect(hydration.getFeatureHydration).toHaveBeenCalledTimes(2)
    expect(scope.switchToOrganization).toHaveBeenCalledWith(organization)
    expect(router.navigate).toHaveBeenCalledWith(['/project', 'project-1'])
  })
})
