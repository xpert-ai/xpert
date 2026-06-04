import { Dialog } from '@angular/cdk/dialog'
import { NoopAnimationsModule } from '@angular/platform-browser/animations'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { IOrganization } from '@xpert-ai/contracts'
import { UsersService } from '@xpert-ai/cloud/state'
import { firstValueFrom, of } from 'rxjs'
import {
  OrganizationsService,
  RequestScopeLevel,
  ScreenshotService,
  Store,
  ToastrService
} from '../../../@core'
import { OrganizationsComponent } from './organizations.component'

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
  tags: []
}

class MockStore {
  activeScope = { level: RequestScopeLevel.ORGANIZATION, organizationId: organization.id }
  selectedOrganization = organization
  organizationId = organization.id
  featureTenant = []
  featureOrganizations = []
  user = { organizations: [{ organization, isDefault: true }] }

  selectActiveScope() {
    return of(this.activeScope)
  }

  hasPermission() {
    return true
  }
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
          provide: ScreenshotService,
          useValue: {
            create: jest.fn()
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

  it('renders a readable tenant organization id column', async () => {
    store.activeScope = { level: RequestScopeLevel.TENANT }

    const translate = TestBed.inject(TranslateService)
    translate.setTranslation('zh-Hans', {
      PAC: {
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
    const idCell = fixture.nativeElement.querySelector<HTMLTableCellElement>('tbody tr td:nth-child(3)')

    expect(headers).toContain('组织 ID')
    expect(headers.filter((header) => header === '标识')).toHaveLength(1)
    expect(table?.className).not.toContain('table-fixed')
    expect(idCell?.textContent?.trim()).toBe(organization.id)
    expect(idCell?.className).toContain('min-w-[280px]')
    expect(idCell?.className).not.toContain('truncate')
  })
})
