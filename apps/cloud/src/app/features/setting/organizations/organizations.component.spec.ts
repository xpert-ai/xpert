import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { IOrganization, PermissionsEnum } from '@xpert-ai/contracts'
import { UsersService } from '@cloud/app/@core/state'
import { firstValueFrom, of, throwError } from 'rxjs'
import { OrganizationsService, RequestScopeLevel, StorageFileService, Store, ToastrService } from '../../../@core'
import { OrganizationsComponent } from './organizations.component'

jest.mock('@milkdown/crepe', () => ({
  Crepe: class Crepe {
    static Feature = {
      AI: 'ai',
      Placeholder: 'placeholder',
      TopBar: 'top-bar'
    }
  }
}))

const organization: IOrganization = {
  id: 'org-1',
  name: 'Acme',
  isDefault: true,
  profile_link: 'acme',
  totalEmployees: 0,
  banner: '',
  short_description: '',
  client_focus: '',
  overview: '',
  currency: 'USD',
  isActive: true,
  defaultValueDateType: 'TODAY',
  sidebarExpandedByDefault: true,
  tags: []
}

class MockStore {
  activeScope = { level: RequestScopeLevel.ORGANIZATION, organizationId: organization.id }
  selectedOrganization = organization
  organizationId = organization.id
  featureTenant = []
  featureOrganizations = []
  featureContextHydrated = true
  featureContextHydrated$ = of(true)
  user = { organizations: [{ organization, isDefault: true }] }

  selectActiveScope() {
    return of(this.activeScope)
  }

  hasPermission = jest.fn(() => true)

  hasFeatureEnabled = jest.fn(() => true)
}

describe('OrganizationsComponent', () => {
  let store: MockStore

  beforeEach(async () => {
    TestBed.resetTestingModule()
    store = new MockStore()

    await TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, TranslateModule.forRoot(), OrganizationsComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
            snapshot: {
              paramMap: convertToParamMap({})
            }
          }
        },
        {
          provide: Router,
          useValue: {
            navigate: jest.fn()
          }
        },
        {
          provide: Store,
          useValue: store
        },
        {
          provide: OrganizationsService,
          useValue: {
            getById: jest.fn(() => of(organization)),
            getAll: jest.fn(() => of({ items: [organization], total: 1 })),
            update: jest.fn(() => of(organization)),
            demo: jest.fn(() => of({}))
          }
        },
        {
          provide: UsersService,
          useValue: {
            getMe: jest.fn(() => Promise.resolve({ organizations: [{ organization, isDefault: true }] }))
          }
        },
        {
          provide: Dialog,
          useValue: {
            open: jest.fn()
          }
        },
        {
          provide: ToastrService,
          useValue: {
            success: jest.fn(),
            error: jest.fn()
          }
        },
        {
          provide: StorageFileService,
          useValue: {
            uploadStorageFile: jest.fn()
          }
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('renders the selected organization id as text in the general field', async () => {
    const fixture = TestBed.createComponent(OrganizationsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const idValue = fixture.nativeElement.querySelector<HTMLElement>('[data-testid="organization-id-value"]')

    expect(idValue).not.toBeNull()
    expect(idValue?.textContent?.trim()).toBe(organization.id)
    expect(fixture.nativeElement.querySelector('[data-testid="organization-id-input"]')).toBeNull()
  })

  it('shows organization identity first and moves the full id to details', async () => {
    store.activeScope = { level: RequestScopeLevel.TENANT }

    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('zh-Hans', {
      XP: {
        KEY_WORDS: {
          ACTION: '操作',
          CURRENCY: '币种',
          IsDefault: '默认',
          Logo: '标识',
          NAME: '名称',
          Status: '状态',
          TimeZone: '时区'
        },
        ORGANIZATIONS_PAGE: {
          Organization: {
            OrganizationId: '组织 ID'
          }
        }
      }
    })
    await firstValueFrom(translate.use('zh-Hans'))

    const fixture = TestBed.createComponent(OrganizationsComponent)

    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()

    const table = fixture.nativeElement.querySelector<HTMLTableElement>('table')
    const headers = Array.from(fixture.nativeElement.querySelectorAll<HTMLTableCellElement>('thead th')).map((header) =>
      header.textContent?.trim()
    )
    const identityCell = fixture.nativeElement.querySelector<HTMLTableCellElement>('tbody tr td:first-child')

    expect(headers).not.toContain('组织 ID')
    expect(table?.querySelector('xp-org-avatar')).not.toBeNull()
    expect(identityCell?.textContent).toContain(organization.name)
    expect(identityCell?.textContent).not.toContain(organization.id)
    expect(fixture.componentInstance.detailTabs().map((tab) => tab.id)).toEqual([
      'general',
      'members',
      'user-groups',
      'controls'
    ])
  })

  it('loads and saves the organization sidebar default', async () => {
    const fixture = TestBed.createComponent(OrganizationsComponent)
    const organizationsService = TestBed.inject(OrganizationsService)

    fixture.detectChanges()
    await fixture.whenStable()

    expect(fixture.componentInstance.form.controls.sidebarExpandedByDefault.value).toBe(true)

    fixture.componentInstance.form.controls.sidebarExpandedByDefault.setValue(false)
    await fixture.componentInstance.saveOrganization()

    expect(organizationsService.update).toHaveBeenCalledWith(
      organization.id,
      expect.objectContaining({ sidebarExpandedByDefault: false })
    )
  })
  it('keeps governance disabled in organization scope and hides SMTP when unavailable', async () => {
    store.hasFeatureEnabled.mockReturnValue(false)
    const fixture = TestBed.createComponent(OrganizationsComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.form.controls.isDefault.disabled).toBe(true)
    expect(fixture.componentInstance.form.controls.isActive.disabled).toBe(true)
    expect(fixture.componentInstance.detailTabs().map((tab) => tab.id)).toEqual([
      'general',
      'members',
      'user-groups',
      'controls',
      'tags',
      'demo'
    ])
    await fixture.componentInstance.addOrganization()
    expect(TestBed.inject(Dialog).open).not.toHaveBeenCalled()
  })

  it('disables edits and blocks saves without organization edit permission', async () => {
    store.hasPermission.mockImplementation(
      (permission?: PermissionsEnum) => permission !== PermissionsEnum.ALL_ORG_EDIT
    )
    const fixture = TestBed.createComponent(OrganizationsComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.form.disabled).toBe(true)
    expect(fixture.componentInstance.canManageSelectedMembers()).toBe(true)
    await fixture.componentInstance.saveOrganization()
    expect(TestBed.inject(OrganizationsService).update).not.toHaveBeenCalled()
  })

  it('copies the full id through CDK clipboard on the first click', async () => {
    const copy = jest.spyOn(TestBed.inject(Clipboard), 'copy').mockReturnValue(true)
    const fixture = TestBed.createComponent(OrganizationsComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    fixture.nativeElement.querySelector('button[aria-label="XP.OrganizationSettings.CopyId"]').click()
    expect(copy).toHaveBeenCalledTimes(1)
    expect(copy).toHaveBeenCalledWith(organization.id)
  })

  it('resets dirty values and keeps invalid input from reaching the service', async () => {
    const fixture = TestBed.createComponent(OrganizationsComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const component = fixture.componentInstance
    component.form.controls.name.setValue('')
    component.form.markAsDirty()
    await component.saveOrganization()
    expect(TestBed.inject(OrganizationsService).update).not.toHaveBeenCalled()
    component.resetForm()
    expect(component.form.controls.name.value).toBe(organization.name)
    expect(component.form.pristine).toBe(true)
  })

  it('recovers the detail workspace after a load failure', async () => {
    const service = TestBed.inject(OrganizationsService)
    jest.spyOn(service, 'getById').mockReturnValueOnce(throwError(() => new Error('Unavailable')))
    const fixture = TestBed.createComponent(OrganizationsComponent)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.error()).toBeTruthy()
    fixture.componentInstance.refresh()
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(fixture.componentInstance.error()).toBeNull()
    expect(fixture.componentInstance.selectedOrganizationId()).toBe(organization.id)
  })
})
