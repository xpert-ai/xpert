import { fakeAsync, TestBed, tick } from '@angular/core/testing'
import { ActivatedRoute, Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { IIntegration, RequestScopeLevel } from '@xpert-ai/contracts'
import { XpConfirmDeleteService } from '@xpert-ai/headless-ui'
import { BehaviorSubject, of, Subject } from 'rxjs'
import { IntegrationService, OrderTypeEnum, Store, ToastrService } from '../../../@core'
import { IntegrationHomeComponent } from './home.component'

jest.mock('echarts/core', () => ({ registerTheme: jest.fn() }))

const records: IIntegration[] = [
  { id: 'one', name: 'Team GitHub', slug: 'github-team', provider: 'github', description: 'Repository events' },
  { id: 'two', name: 'Team Chat', slug: 'chat-team', provider: 'chat', description: 'Team notifications' }
]

describe('Integration directory', () => {
  function setup() {
    const source = new BehaviorSubject({ items: records, total: records.length })
    const api = {
      getProviders: jest.fn(() => of([{ name: 'github', label: { en_US: 'GitHub' } }])),
      getAllInOrg: jest.fn(() => source),
      delete: jest.fn(() => of(undefined))
    }
    const confirmResult = new Subject<boolean>()
    const confirm = { confirm: jest.fn(() => confirmResult) }
    const router = { navigate: jest.fn() }
    const toastr = { error: jest.fn(), success: jest.fn() }
    const activeScope = { level: RequestScopeLevel.ORGANIZATION, organizationId: 'org' }
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        { provide: IntegrationService, useValue: api },
        { provide: Store, useValue: { activeScope, selectActiveScope: () => of(activeScope) } },
        { provide: XpConfirmDeleteService, useValue: confirm },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: {} },
        { provide: ToastrService, useValue: toastr }
      ]
    })
    const component = TestBed.runInInjectionContext(() => new IntegrationHomeComponent())
    return { component, api, source, confirm, confirmResult, router, toastr }
  }

  afterEach(() => TestBed.resetTestingModule())

  it('retains organization-scoped queries, creator relations and most recently updated ordering', () => {
    const { component, api, source } = setup()
    expect(api.getAllInOrg).toHaveBeenCalledWith({ relations: ['createdBy'], order: { updatedAt: OrderTypeEnum.DESC } })
    expect(component.filteredIntegrations()).toEqual(records)
    source.next({ items: [records[1]], total: 1 })
    expect(component.filteredIntegrations()).toEqual([records[1]])
  })

  it('combines provider with name or description search and clears both filters', fakeAsync(() => {
    const { component } = setup()
    component.searchControl.setValue('  EVENTS ')
    tick(300)
    expect(component.filteredIntegrations()).toEqual([records[0]])
    component.provider.set('chat')
    expect(component.filteredIntegrations()).toEqual([])
    component.clearFilters()
    tick(300)
    expect(component.filteredIntegrations()).toEqual(records)
  }))

  it('recovers the directory after a failed load without losing filter controls', () => {
    const { component, source, api, toastr } = setup()
    component.provider.set('github')
    source.error(new Error('offline'))
    expect(component.loadFailed()).toBe(true)
    expect(component.loading()).toBe(false)
    expect(toastr.error).toHaveBeenCalled()
    api.getAllInOrg.mockReturnValue(new BehaviorSubject({ items: records, total: 2 }))
    component.refresh()
    expect(component.loadFailed()).toBe(false)
    expect(component.filteredIntegrations()).toEqual([records[0]])
  })

  it('keeps deletion behind confirmation and refreshes after confirmation', () => {
    const { component, api, confirmResult } = setup()
    component.remove(records[0])
    confirmResult.next(false)
    expect(api.delete).not.toHaveBeenCalled()
    confirmResult.next(true)
    expect(api.delete).toHaveBeenCalledWith('one')
    expect(api.getAllInOrg).toHaveBeenCalledTimes(2)
  })

  it('keeps create and edit navigation within the existing routes', () => {
    const { component, router } = setup()
    component.newIntegration()
    expect(router.navigate).toHaveBeenLastCalledWith(['create'], { relativeTo: expect.anything() })
    component.edit(records[1])
    expect(router.navigate).toHaveBeenLastCalledWith(['two'], { relativeTo: expect.anything() })
  })
})
