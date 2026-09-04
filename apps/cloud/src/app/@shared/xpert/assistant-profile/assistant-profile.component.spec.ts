import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { TranslateService } from '@ngx-translate/core'
import type { XpertExtensionViewManifest } from '@xpert-ai/contracts'
import { Subject } from 'rxjs'
import { ViewExtensionApiService } from '@cloud/app/@core'
import { ViewClientCommandRegistry } from '../../view-extension/view-client-command-registry.service'
import { AssistantProfileComponent } from './assistant-profile.component'

const tab: XpertExtensionViewManifest = {
  key: 'cases',
  title: 'Cases',
  hostType: 'agent',
  slot: 'agent.profile.tabs',
  view: { type: 'detail', fields: [] }
}

describe('Assistant Profile lifecycle', () => {
  function create() {
    const responses = new Map<string, Subject<XpertExtensionViewManifest[]>>()
    const languageChanges = new Subject<{ lang: string }>()
    const translate = { currentLang: 'en', onLangChange: languageChanges.asObservable() }
    const api = {
      getSlotViews: jest.fn((_type: string, id: string) => {
        const response = new Subject<XpertExtensionViewManifest[]>()
        responses.set(id, response)
        return response.asObservable()
      })
    }
    TestBed.configureTestingModule({
      imports: [AssistantProfileComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ViewExtensionApiService, useValue: api },
        { provide: TranslateService, useValue: translate }
      ]
    }).overrideComponent(AssistantProfileComponent, { set: { imports: [], template: '' } })
    const fixture = TestBed.createComponent(AssistantProfileComponent)
    fixture.componentRef.setInput('assistantId', 'a')
    fixture.detectChanges()
    return {
      fixture,
      responses,
      languageChanges,
      translate,
      http: TestBed.inject(HttpTestingController),
      commands: fixture.debugElement.injector.get(ViewClientCommandRegistry)
    }
  }

  it('updates the localized Assistant title when the active language changes', () => {
    const { fixture, responses, languageChanges, translate, http } = create()
    http
      .expectOne((request) => request.url.endsWith('/xpert/a/profile'))
      .flush({ id: 'a', name: 'Fallback', title: 'English title', titleCN: '中文标题', tags: [] })
    responses.get('a')?.next([])

    expect(fixture.componentInstance.title()).toBe('English title')
    translate.currentLang = 'zh-Hans'
    languageChanges.next({ lang: 'zh-Hans' })
    expect(fixture.componentInstance.title()).toBe('中文标题')

    fixture.destroy()
    http.verify()
  })

  it('cancels both old requests when the Assistant changes and releases subscriptions on close', () => {
    const { fixture, responses, http } = create()
    const old = http.expectOne((request) => request.url.endsWith('/xpert/a/profile'))
    fixture.componentRef.setInput('assistantId', 'b')
    fixture.detectChanges()
    expect(old.cancelled).toBe(true)
    expect(responses.get('a')?.observed).toBe(false)
    responses.get('a')?.next([tab])
    expect(fixture.componentInstance.tabs()).toEqual([])
    http.expectOne((request) => request.url.endsWith('/xpert/b/profile')).flush({ id: 'b', name: 'B', tags: [] })
    responses.get('b')?.next([tab])
    expect(fixture.componentInstance.profile()?.id).toBe('b')
    expect(fixture.componentInstance.selected()).toBe('basic')
    fixture.destroy()
    expect(responses.get('b')?.observed).toBe(false)
    http.verify()
  })

  it('isolates extension errors and restricts hold/close commands to the active view', async () => {
    const { fixture, responses, http, commands } = create()
    http.expectOne((request) => request.url.endsWith('/xpert/a/profile')).flush({ id: 'a', name: 'A', tags: [] })
    responses.get('a')?.error(new Error('plugin unavailable'))
    expect(fixture.componentInstance.profile()?.name).toBe('A')
    expect(fixture.componentInstance.tabsError()).toBe(true)
    fixture.componentInstance.tabs.set([tab])
    fixture.componentInstance.select(tab.key)
    const context = { hostType: 'agent', hostId: 'a', viewKey: tab.key, manifest: tab }
    expect(
      await commands.execute('assistant.profile.interaction', { busy: true }, { ...context, hostId: 'b' })
    ).toEqual({ success: false })
    await commands.execute('assistant.profile.interaction', { busy: true }, context)
    fixture.componentInstance.select('basic')
    expect(fixture.componentInstance.selected()).toBe(tab.key)
    expect(await commands.execute('assistant.profile.close', {}, context)).toEqual({ success: false })
    await commands.execute('assistant.profile.interaction', { busy: false }, context)
    const closed = jest.fn()
    fixture.componentInstance.closed.subscribe(closed)
    expect(await commands.execute('assistant.profile.close', {}, { ...context, viewKey: 'stale' })).toEqual({
      success: false
    })
    await commands.execute('assistant.profile.close', {}, context)
    expect(closed).toHaveBeenCalledTimes(1)
    fixture.destroy()
    expect(await commands.execute('assistant.profile.close', {}, context)).toMatchObject({
      success: false,
      code: 'unsupported'
    })
    http.verify()
  })

  it('keeps previously selected tab instances mounted until the Profile closes', () => {
    const { fixture, responses, http } = create()
    http.expectOne((request) => request.url.endsWith('/xpert/a/profile')).flush({ id: 'a', name: 'A', tags: [] })
    responses.get('a')?.next([tab, { ...tab, key: 'attention' }])

    fixture.componentInstance.select('cases')
    fixture.componentInstance.select('attention')
    fixture.componentInstance.select('basic')
    expect(fixture.componentInstance.mountedTabKeys()).toEqual(['cases', 'attention'])

    fixture.componentRef.setInput('assistantId', 'b')
    fixture.detectChanges()
    expect(fixture.componentInstance.mountedTabKeys()).toEqual([])
    http.expectOne((request) => request.url.endsWith('/xpert/b/profile')).flush({ id: 'b', name: 'B', tags: [] })
    fixture.destroy()
    http.verify()
  })
})
