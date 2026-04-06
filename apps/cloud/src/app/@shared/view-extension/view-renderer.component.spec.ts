import { TestBed } from '@angular/core/testing'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of } from 'rxjs'
import { ToastrService, ViewExtensionApiService } from '@cloud/app/@core'
import { XpertExtensionViewManifest } from '@metad/contracts'
import { ViewRendererComponent } from './view-renderer.component'

describe('ViewRendererComponent', () => {
  const text = (en_US: string, zh_Hans?: string) => ({
    en_US,
    ...(zh_Hans ? { zh_Hans } : {})
  })

  let api: {
    getViewData: jest.Mock
    executeAction: jest.Mock
  }
  let toastr: {
    success: jest.Mock
    error: jest.Mock
  }
  let router: {
    navigateByUrl: jest.Mock
  }

  beforeEach(async () => {
    api = {
      getViewData: jest
        .fn()
        .mockReturnValueOnce(
          of({
            items: [{ id: '1', title: 'First', subtitle: 'One' }],
            total: 2
          })
        )
        .mockReturnValueOnce(
          of({
            items: [{ id: '2', title: 'Second', subtitle: 'Two' }],
            total: 2
          })
        ),
      executeAction: jest.fn()
    }
    toastr = {
      success: jest.fn(),
      error: jest.fn()
    }
    router = {
      navigateByUrl: jest.fn()
    }

    TestBed.resetTestingModule()
    await TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot(), ViewRendererComponent],
      providers: [
        {
          provide: ViewExtensionApiService,
          useValue: api
        },
        {
          provide: ToastrService,
          useValue: toastr
        },
        {
          provide: Router,
          useValue: router
        }
      ]
    }).compileComponents()
  })

  afterEach(() => {
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it('appends list pages when loading more', async () => {
    const fixture = TestBed.createComponent(ViewRendererComponent)
    const manifest: XpertExtensionViewManifest = {
      key: 'provider__activity',
      title: text('Activity', '活动'),
      hostType: 'project',
      slot: 'detail.sections',
      source: {
        provider: 'provider'
      },
      view: {
        type: 'list',
        item: {
          titleKey: 'title',
          subtitleKey: 'subtitle'
        },
        pagination: {
          enabled: true,
          pageSize: 1
        }
      },
      dataSource: {
        mode: 'platform',
        querySchema: {
          supportsPagination: true,
          defaultPageSize: 1
        }
      }
    }

    fixture.componentRef.setInput('hostType', 'project')
    fixture.componentRef.setInput('hostId', 'project-1')
    fixture.componentRef.setInput('manifest', manifest)
    fixture.componentRef.setInput('active', true)
    fixture.detectChanges()
    await fixture.whenStable()

    const component = fixture.componentInstance
    expect(component.items()).toEqual([{ id: '1', title: 'First', subtitle: 'One' }])

    component.onPageChange(2)
    fixture.detectChanges()
    await fixture.whenStable()

    expect(api.getViewData).toHaveBeenNthCalledWith(1, 'project', 'project-1', 'provider__activity', {
      page: 1,
      pageSize: 1
    })
    expect(api.getViewData).toHaveBeenNthCalledWith(2, 'project', 'project-1', 'provider__activity', {
      page: 2,
      pageSize: 1
    })
    expect(component.items()).toEqual([
      { id: '1', title: 'First', subtitle: 'One' },
      { id: '2', title: 'Second', subtitle: 'Two' }
    ])
  })
})
