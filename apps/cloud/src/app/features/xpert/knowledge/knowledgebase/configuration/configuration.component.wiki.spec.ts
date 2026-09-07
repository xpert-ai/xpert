import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { signal } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { provideRouter } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { of } from 'rxjs'
import { AiModelTypeEnum, IKnowledgebase, Store, ToastrService } from '../../../../../@core'
import { CopilotProviderService } from '../../../../../@core/services/copilot-provider.service'
import { CopilotServerService } from '../../../../../@core/services/copilot-server.service'
import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeConfigurationComponent } from './configuration.component'

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

describe('Wiki settings form', () => {
  let fixture: ComponentFixture<KnowledgeConfigurationComponent>
  let root: HTMLElement
  let http: HttpTestingController
  const refresh = jest.fn()
  const toastr = { success: jest.fn(), error: jest.fn() }
  const llm = { id: 'llm-1', copilotId: 'copilot-1', model: 'llm', modelType: AiModelTypeEnum.LLM }

  async function render(enabled?: boolean) {
    const knowledgebase = {
      id: 'kb-1',
      name: 'Wiki test',
      documentNum: 2,
      chatModel: llm,
      wikiConfig: enabled === undefined ? undefined : { enabled, extractionGranularity: 'standard' },
      copilotModel: { ...llm, id: 'embedding-1', modelType: AiModelTypeEnum.TEXT_EMBEDDING }
    } as IKnowledgebase
    await TestBed.configureTestingModule({
      imports: [KnowledgeConfigurationComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: KnowledgebaseComponent, useValue: { knowledgebase: signal(knowledgebase), refresh } },
        { provide: Store, useValue: { selectOrganizationId: () => of('org-1'), preferredLanguage$: of('en') } },
        { provide: NGXLogger, useValue: {} },
        { provide: CopilotServerService, useValue: { getCopilotModels: () => of([]) } },
        { provide: CopilotProviderService, useValue: { getModelParameterRules: () => of([]) } },
        { provide: ToastrService, useValue: toastr }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(KnowledgeConfigurationComponent)
    root = fixture.nativeElement
    http = TestBed.inject(HttpTestingController)
    await settle()
    for (const request of http.match((request) => request.url.endsWith('/graph/status'))) {
      request.flush({ status: 'disabled', entityCount: 0, relationCount: 0 })
    }
    await settle()
  }

  async function settle() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  function element<T extends Element = HTMLElement>(selector: string): T {
    const found = root.querySelector<T>(selector)
    if (!found) throw new Error('Missing settings element: ' + selector)
    return found
  }

  async function enter(selector: string, value: string) {
    const input = element<HTMLTextAreaElement>(selector)
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
  }

  afterEach(() => {
    http?.verify()
    TestBed.resetTestingModule()
    jest.clearAllMocks()
    jest.restoreAllMocks()
  })

  it.each([undefined, false, true])(
    'only renders Wiki model and generation fields when enabled (%s)',
    async (enabled) => {
      await render(enabled)
      expect(root.querySelectorAll('copilot-model-select')).toHaveLength(enabled ? 4 : 3)
      expect(root.querySelectorAll('textarea[maxlength="4000"]')).toHaveLength(enabled ? 2 : 0)
      expect(root.textContent?.includes('XP.Knowledgebase.WikiModelFallback')).toBe(enabled === true)
    }
  )

  it('confirms charges and sends all edited Wiki fields in one combined HTTP request', async () => {
    await render(true)
    element<HTMLElement>('z-toggle-group-item[value="exhaustive"]').click()
    await settle()
    await enter(
      'textarea[placeholder="XP.Knowledgebase.WikiContentGenerationRequirementsPlaceholder"]',
      'Show evidence'
    )
    await enter('textarea[placeholder="XP.Knowledgebase.WikiExtractionFocusPlaceholder"]', 'Organizations')
    expect(
      Array.from(root.querySelectorAll('textarea[maxlength="4000"]')).map((input) => input.getAttribute('maxlength'))
    ).toEqual(['4000', '4000'])

    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const save = element<HTMLButtonElement>('button.btn-primary')
    expect(save.disabled).toBe(false)
    save.click()
    http.expectNone('/api/knowledgebase/kb-1/wiki/config')
    save.click()
    const request = http.expectOne('/api/knowledgebase/kb-1/wiki/config')
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(request.request.method).toBe('PUT')
    expect(request.request.body).toMatchObject({
      settings: { name: 'Wiki test', chatModel: llm },
      wikiConfig: {
        enabled: true,
        extractionGranularity: 'exhaustive',
        contentGenerationRequirements: 'Show evidence',
        extractionFocus: 'Organizations'
      },
      wikiModel: null,
      confirmModelCharges: true
    })
    expect(request.request.body.settings.wikiConfig).toBeUndefined()
    expect(request.request.body.settings.wikiModel).toBeUndefined()
    http.expectNone('/api/knowledgebase/kb-1')
    request.flush({ message: 'Wiki configuration rejected' }, { status: 400, statusText: 'Bad Request' })
    await settle()
    expect(toastr.error).toHaveBeenCalled()
    expect(toastr.success).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(
      element<HTMLTextAreaElement>('textarea[placeholder="XP.Knowledgebase.WikiExtractionFocusPlaceholder"]').value
    ).toBe('Organizations')
    expect(save.disabled).toBe(false)
  })
})
