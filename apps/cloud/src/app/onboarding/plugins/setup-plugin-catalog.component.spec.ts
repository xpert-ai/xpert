import { TestBed } from '@angular/core/testing'
import { By } from '@angular/platform-browser'
import { ZardSelectComponent, ZardPaginatorComponent, ZardSearchInputComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { of, Subject } from 'rxjs'
import type { SetupPluginCatalogItem, SetupPluginCatalogResponse } from '@xpert-ai/contracts'
import { SetupPluginsService } from '../../@core/services/setup-plugins.service'
import { SetupPluginCatalogComponent } from './setup-plugin-catalog.component'

jest.mock('../../@core', () => ({ getErrorMessage: (error: Error) => error.message }))

const item = (packageName: string): SetupPluginCatalogItem => ({ packageName, title: packageName, installed: false })
const response = (page = 1): SetupPluginCatalogResponse => ({
  items: page === 1 ? [item('first')] : [item('last')],
  total: 13,
  page,
  pageSize: 12,
  selectableNames: ['first', 'last'],
  facets: { types: [], businessCategories: [] },
  errors: []
})

describe('SetupPluginCatalogComponent', () => {
  const api = { catalog: jest.fn() }
  beforeEach(() => {
    jest.useFakeTimers()
    jest.resetAllMocks()
    TestBed.configureTestingModule({
      imports: [SetupPluginCatalogComponent, TranslateModule.forRoot()],
      providers: [{ provide: SetupPluginsService, useValue: api }]
    })
    api.catalog.mockReturnValue(of(response()))
  })
  afterEach(() => {
    TestBed.resetTestingModule()
    jest.useRealTimers()
  })

  it('selects across every matching page and preserves selections across pages and filters', async () => {
    const component = TestBed.runInInjectionContext(() => new SetupPluginCatalogComponent())
    await jest.advanceTimersByTimeAsync(0)
    expect(component.selected().size).toBe(0)
    component.selectAll()
    expect([...component.selected()]).toEqual(['first', 'last'])
    api.catalog.mockReturnValue(of(response(2)))
    component.page({ pageIndex: 1, pageSize: 12, length: 13 })
    await jest.advanceTimersByTimeAsync(0)
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    expect(component.selected().has('last')).toBe(true)
    component.toggle(item('last'))
    expect([...component.selected()]).toEqual(['first'])
    api.catalog.mockReturnValue(of({ ...response(), items: [item('third')], selectableNames: ['third'] }))
    component.filterType('model')
    await jest.advanceTimersByTimeAsync(0)
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, type: 'model' }))
    component.selectAll()
    expect([...component.selected()]).toEqual(['first', 'third'])
    component.clearSelection()
    expect(component.selected().size).toBe(0)
  })

  it('never selects installed or unavailable plugins', async () => {
    const component = TestBed.runInInjectionContext(() => new SetupPluginCatalogComponent())
    await jest.advanceTimersByTimeAsync(0)
    component.toggle({ ...item('installed'), installed: true })
    component.toggle({ ...item('manual'), unavailableReason: 'unsupported-source' })
    expect(component.selected().size).toBe(0)
  })

  it('ignores stale responses when a search starts and resets to the first page', async () => {
    const stale = new Subject<SetupPluginCatalogResponse>()
    api.catalog.mockReturnValueOnce(stale)
    const component = TestBed.runInInjectionContext(() => new SetupPluginCatalogComponent())
    component.search('new search')
    stale.next({ ...response(), items: [item('stale')] })
    await jest.advanceTimersByTimeAsync(0)
    expect(component.response()).toBeNull()
    api.catalog.mockReturnValue(of({ ...response(), items: [item('fresh')] }))
    await jest.advanceTimersByTimeAsync(250)
    expect(component.response()?.items[0].packageName).toBe('fresh')
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'new search', page: 1 }))
  })

  it('renders declared business and type groups without deriving them from titles', async () => {
    api.catalog.mockReturnValue(
      of({
        ...response(),
        items: [
          { ...item('model-in-name'), type: 'tools', businessCategory: 'productivity' },
          item('no-classification')
        ]
      })
    )
    const component = TestBed.runInInjectionContext(() => new SetupPluginCatalogComponent())
    await jest.advanceTimersByTimeAsync(0)
    component.groupBy('business')
    await jest.advanceTimersByTimeAsync(0)
    expect(component.groups().map((group) => group.key)).toEqual(['productivity', 'unclassified'])
    component.groupBy('type')
    await jest.advanceTimersByTimeAsync(0)
    expect(component.groups().map((group) => group.key)).toEqual(['tools', 'unclassified'])
  })
  it('renders card metadata and the actual selected grouping option after asynchronous loading', async () => {
    api.catalog.mockReturnValue(
      of({
        ...response(),
        selectableNames: ['example'],
        items: [
          {
            ...item('example'),
            title: 'Example title',
            description: 'Example description',
            level: 'tenant',
            version: '2.1.0',
            icon: { type: 'emoji', value: '📦' }
          }
        ]
      })
    )
    const fixture = TestBed.createComponent(SetupPluginCatalogComponent)
    fixture.detectChanges()
    await jest.advanceTimersByTimeAsync(0)
    fixture.detectChanges()
    await jest.advanceTimersByTimeAsync(0)
    const element: HTMLElement = fixture.nativeElement
    expect(element.querySelector('select')).toBeNull()
    const grouping: ZardSelectComponent = fixture.debugElement.queryAll(By.directive(ZardSelectComponent))[3]
      .componentInstance
    expect(grouping.zValue()).toBe('none')
    expect(element.textContent).toContain('Example title')
    expect(element.textContent).toContain('Example description')
    expect(element.textContent).toContain('v2.1.0')
    expect(element.querySelector('xp-icon')).not.toBeNull()
    grouping.selectItem('type', 'Type')
    await jest.advanceTimersByTimeAsync(0)
    fixture.detectChanges()
    expect(fixture.componentInstance.query().groupBy).toBe('type')
    await jest.advanceTimersByTimeAsync(0)
    fixture.detectChanges()
    const checkbox = element.querySelector<HTMLInputElement>('z-checkbox input[type="checkbox"]')!
    checkbox.click()
    await jest.advanceTimersByTimeAsync(0)
    fixture.detectChanges()
    expect(fixture.componentInstance.selected().has('example')).toBe(true)
    await jest.advanceTimersByTimeAsync(0)
    fixture.detectChanges()
    fixture.componentInstance.clearSelection()
    fixture.detectChanges()
    await jest.advanceTimersByTimeAsync(0)
    fixture.detectChanges()
    expect(checkbox.checked).toBe(false)
    fixture.componentInstance.selectAll()
    fixture.detectChanges()
    await jest.advanceTimersByTimeAsync(0)
    fixture.detectChanges()
    expect(checkbox.checked).toBe(true)

    const filters: ZardSelectComponent[] = fixture.debugElement
      .queryAll(By.directive(ZardSelectComponent))
      .map((item) => item.componentInstance)
    filters[1].selectItem('model', 'Model')
    await jest.advanceTimersByTimeAsync(0)
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'model', page: 1 }))
    filters[1].selectItem(fixture.componentInstance.allOption, 'All types')
    await jest.advanceTimersByTimeAsync(0)
    expect(fixture.componentInstance.query().type).toBeUndefined()

    const paginator: ZardPaginatorComponent = fixture.debugElement.query(
      By.directive(ZardPaginatorComponent)
    ).componentInstance
    paginator.changePageSize(24)
    await jest.advanceTimersByTimeAsync(0)
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 24, page: 1 }))

    const search: ZardSearchInputComponent = fixture.debugElement.query(
      By.directive(ZardSearchInputComponent)
    ).componentInstance
    search.valueChange.emit('model')
    await jest.advanceTimersByTimeAsync(250)
    expect(api.catalog).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'model', page: 1 }))
    search.valueChange.emit('')
    await jest.advanceTimersByTimeAsync(250)
    expect(fixture.componentInstance.query().search).toBeUndefined()
  })
})
