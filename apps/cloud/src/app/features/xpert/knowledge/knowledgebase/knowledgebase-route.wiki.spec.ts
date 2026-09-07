import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { Component, signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { provideRouter, Router } from '@angular/router'
import { RouterTestingHarness } from '@angular/router/testing'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { of } from 'rxjs'
import { KnowledgebaseTypeEnum, Store, ToastrService, XpertAPIService } from '../../../../@core'
import { AppService } from '../../../../app.service'
import { isKnowledgebaseWikiEnabled } from './knowledgebase-route'
import { KnowledgebaseComponent } from './knowledgebase.component'

jest.mock('@milkdown/crepe', () => ({
  Crepe: jest.fn(() => {
    throw new Error('Unexpected Markdown editor')
  })
}))
jest.mock('mermaid', () => ({ initialize: jest.fn(), render: jest.fn() }))
jest.mock('@xterm/xterm', () => ({
  Terminal: jest.fn(() => {
    throw new Error('Unexpected terminal')
  })
}))

@Component({ standalone: true, template: 'Page content' })
class PageStub {}

describe('isKnowledgebaseWikiEnabled', () => {
  it('fails closed for legacy and explicitly disabled knowledgebases', () => {
    expect(isKnowledgebaseWikiEnabled(undefined)).toBe(false)
    expect(isKnowledgebaseWikiEnabled({})).toBe(false)
    expect(isKnowledgebaseWikiEnabled({ wikiConfig: { enabled: false } })).toBe(false)
  })

  it('allows the Wiki route only when Wiki is explicitly enabled', () => {
    expect(isKnowledgebaseWikiEnabled({ wikiConfig: { enabled: true } })).toBe(true)
  })
})

describe('Knowledgebase Wiki tab', () => {
  let http: HttpTestingController

  async function render() {
    await TestBed.configureTestingModule({
      imports: [KnowledgebaseComponent, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        provideRouter([
          {
            path: 'xpert/knowledges/:id',
            component: KnowledgebaseComponent,
            children: [
              // Disable route animation state in this shell/navigation test.
              { path: 'documents', component: PageStub, data: { title: false } },
              { path: 'wiki', component: PageStub, data: { title: false } }
            ]
          }
        ]),
        { provide: Store, useValue: { selectOrganizationId: () => of('org-1'), preferredLanguage$: of('en') } },
        { provide: AppService, useValue: { isMobile: signal(false) } },
        { provide: NGXLogger, useValue: {} },
        { provide: XpertAPIService, useValue: {} },
        { provide: ToastrService, useValue: { danger: jest.fn(), success: jest.fn() } }
      ]
    }).compileComponents()
    http = TestBed.inject(HttpTestingController)
    const harness = await RouterTestingHarness.create()
    const component = await harness.navigateByUrl('/xpert/knowledges/kb-1/documents', KnowledgebaseComponent)
    return { harness, component }
  }

  function respond(enabled?: boolean) {
    http.expectOne('/api/knowledgebase/detail/kb-1').flush({
      id: 'kb-1',
      name: 'Wiki test',
      type: KnowledgebaseTypeEnum.Standard,
      xperts: [],
      wikiConfig: enabled === undefined ? undefined : { enabled }
    })
  }

  async function settle(harness: RouterTestingHarness) {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }

  function wikiTab(harness: RouterTestingHarness) {
    return harness.routeNativeElement?.querySelector<HTMLAnchorElement>(
      'nav[aria-label="Knowledge base"] a[href*="/wiki"]'
    )
  }

  afterEach(() => {
    http?.verify()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
  })

  it.each([undefined, false, true])(
    'waits for detail and shows the tab only when Wiki is enabled (%s)',
    async (enabled) => {
      const { harness } = await render()
      expect(wikiTab(harness)).toBeNull()
      respond(enabled)
      await settle(harness)

      expect(Boolean(wikiTab(harness))).toBe(enabled === true)
      if (enabled) {
        expect(wikiTab(harness)?.textContent).toContain('Wiki')
        expect(wikiTab(harness)?.getAttribute('href')).toBe('/xpert/knowledges/kb-1/wiki')
      }
    }
  )

  it('hides the tab and returns to documents if refreshed settings disable the open Wiki', async () => {
    const { harness, component } = await render()
    respond(true)
    await settle(harness)
    await harness.navigateByUrl('/xpert/knowledges/kb-1/wiki?returnTo=%2Fxpert%2Fw%2Fw1')
    expect(wikiTab(harness)).not.toBeNull()

    component.refresh()
    harness.detectChanges()
    respond(false)
    await settle(harness)

    const router = TestBed.inject(Router)
    expect(wikiTab(harness)).toBeNull()
    expect(router.url.split('?')[0]).toBe('/xpert/knowledges/kb-1/documents')
    expect(router.parseUrl(router.url).queryParams['returnTo']).toBe('/xpert/w/w1')
  })
})
