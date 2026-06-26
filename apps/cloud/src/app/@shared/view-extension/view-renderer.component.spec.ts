jest.mock('@cloud/app/@core', () => {
  const { inject } = jest.requireActual('@angular/core')

  class ViewExtensionApiService {}
  class ToastrService {}

  return {
    ViewExtensionApiService,
    ToastrService,
    getErrorMessage: (error: unknown) => {
      if (error && typeof error === 'object') {
        const responseError = Reflect.get(error, 'error')
        if (responseError && typeof responseError === 'object') {
          const message = Reflect.get(responseError, 'message')
          if (typeof message === 'string') {
            return message
          }
        }
      }

      return error instanceof Error ? error.message : String(error ?? '')
    },
    injectToastr: () => inject(ToastrService),
    injectViewExtensionApi: () => inject(ViewExtensionApiService)
  }
})

import { TestBed } from '@angular/core/testing'
import { HttpErrorResponse } from '@angular/common/http'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { of, throwError } from 'rxjs'
import { ToastrService, ViewExtensionApiService } from '@cloud/app/@core'
import { XpertExtensionViewManifest } from '@xpert-ai/contracts'
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

  it('strips stale query values when the view does not declare query support', async () => {
    api.getViewData.mockReset()
    api.getViewData.mockReturnValue(of({ item: { state: 'connected' } }))

    const fixture = TestBed.createComponent(ViewRendererComponent)
    const manifest: XpertExtensionViewManifest = {
      key: 'provider__status',
      title: text('Status', '状态'),
      hostType: 'project',
      slot: 'detail.sections',
      source: {
        provider: 'provider'
      },
      view: {
        type: 'detail',
        fields: [{ key: 'state', label: text('State', '状态') }]
      },
      dataSource: {
        mode: 'platform'
      }
    }

    fixture.componentRef.setInput('hostType', 'project')
    fixture.componentRef.setInput('hostId', 'project-1')
    fixture.componentRef.setInput('manifest', manifest)
    fixture.componentRef.setInput('active', true)
    fixture.detectChanges()
    await fixture.whenStable()

    api.getViewData.mockClear()
    fixture.componentInstance.query.set({
      page: 2,
      pageSize: 20,
      search: 'connected',
      sortBy: 'state',
      sortDirection: 'desc',
      parameters: {
        state: 'connected'
      }
    })
    fixture.detectChanges()
    await fixture.whenStable()

    expect(api.getViewData).toHaveBeenLastCalledWith('project', 'project-1', 'provider__status', {})
  })

  it('uses backend supplied i18n keys for view data errors', async () => {
    api.getViewData.mockReset()
    api.getViewData.mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 400,
            error: {
              message: '此视图不支持查询参数',
              i18nKey: 'ViewExtension.Errors.QueryParameters'
            }
          })
      )
    )

    const fixture = TestBed.createComponent(ViewRendererComponent)
    const manifest: XpertExtensionViewManifest = {
      key: 'provider__status',
      title: text('Status', '状态'),
      hostType: 'project',
      slot: 'detail.sections',
      source: {
        provider: 'provider'
      },
      view: {
        type: 'detail',
        fields: [{ key: 'state', label: text('State', '状态') }]
      },
      dataSource: {
        mode: 'platform'
      }
    }

    fixture.componentRef.setInput('hostType', 'project')
    fixture.componentRef.setInput('hostId', 'project-1')
    fixture.componentRef.setInput('manifest', manifest)
    fixture.componentRef.setInput('active', true)
    fixture.detectChanges()
    await fixture.whenStable()

    expect(fixture.componentInstance.error()).toBe('此视图不支持查询参数')
    expect(fixture.componentInstance.errorI18nKey()).toBe('ViewExtension.Errors.QueryParameters')
  })
})
