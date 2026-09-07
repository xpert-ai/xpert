import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { provideHttpClient } from '@angular/common/http'
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { provideNoopAnimations } from '@angular/platform-browser/animations'
import { TranslateModule } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { of } from 'rxjs'
import { AiModelTypeEnum, IKnowledgebase, KnowledgebaseTypeEnum, Store, ToastrService } from '../../../../@core'
import { CopilotProviderService } from '../../../../@core/services/copilot-provider.service'
import { CopilotServerService } from '../../../../@core/services/copilot-server.service'
import { XpertNewKnowledgeComponent } from './new.component'

// Unused third-party editor/chart/terminal engines cannot run in jsdom; all form controls remain real.
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

const embedding = {
  id: 'embedding-1',
  copilotId: 'copilot-1',
  model: 'embedding',
  modelType: AiModelTypeEnum.TEXT_EMBEDDING
}
const llm = { id: 'llm-1', copilotId: 'copilot-1', model: 'llm', modelType: AiModelTypeEnum.LLM }
const wikiModel = { ...llm, id: 'wiki-model-1', model: 'wiki-model' }
const draft = { name: 'Wiki test', type: KnowledgebaseTypeEnum.Standard, copilotModel: embedding, chatModel: llm }
const prefix = 'XP.Knowledgebase.WorkspaceConfiguration'

describe('Wiki creation and editing form', () => {
  let fixture: ComponentFixture<XpertNewKnowledgeComponent>
  let root: HTMLElement
  let http: HttpTestingController
  const close = jest.fn()
  const toastr = { success: jest.fn(), error: jest.fn() }

  async function render(knowledgebase: Partial<IKnowledgebase> = { ...draft }) {
    await TestBed.configureTestingModule({
      imports: [XpertNewKnowledgeComponent, TranslateModule.forRoot()],
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DIALOG_DATA, useValue: { workspaceId: 'workspace-1', knowledgebase } },
        { provide: DialogRef, useValue: { close } },
        { provide: Store, useValue: { selectOrganizationId: () => of('org-1') } },
        { provide: NGXLogger, useValue: {} },
        { provide: CopilotServerService, useValue: { getCopilotModels: () => of([]) } },
        { provide: CopilotProviderService, useValue: { getModelParameterRules: () => of([]) } },
        { provide: ToastrService, useValue: toastr }
      ]
    }).compileComponents()
    fixture = TestBed.createComponent(XpertNewKnowledgeComponent)
    root = fixture.nativeElement
    http = TestBed.inject(HttpTestingController)
    await settle()
  }

  async function settle() {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }

  function element<T extends Element = HTMLElement>(selector: string): T {
    const found = root.querySelector<T>(selector)
    if (!found) throw new Error('Missing form element: ' + selector)
    return found
  }

  async function enableWiki() {
    element<HTMLButtonElement>('.kb-choice-card:nth-child(2)').click()
    await settle()
  }

  async function enter(selector: string, value: string) {
    const input = element<HTMLInputElement | HTMLTextAreaElement>(selector)
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

  it('can turn Wiki on and off while RAG stays selected, without a NEW badge', async () => {
    await render()
    const rag = element('.kb-choice-card:first-child')
    const wiki = element<HTMLButtonElement>('.kb-choice-card:nth-child(2)')
    expect(wiki.getAttribute('aria-pressed')).toBe('false')
    expect(root.querySelector('[data-wiki-generation-settings]')).toBeNull()
    expect(wiki.textContent).not.toMatch(/\bNEW\b/)

    await enableWiki()
    expect(wiki.getAttribute('aria-pressed')).toBe('true')
    expect(rag.getAttribute('aria-pressed')).toBe('true')
    expect(root.querySelector('[data-wiki-generation-settings]')).not.toBeNull()

    wiki.click()
    await settle()
    expect(wiki.getAttribute('aria-pressed')).toBe('false')
    expect(rag.getAttribute('aria-pressed')).toBe('true')
    expect(root.querySelector('[data-wiki-generation-settings]')).toBeNull()
  })

  it('offers graph indexing independently of the locked Wiki strategy for existing documents', async () => {
    await render({ ...draft, id: 'kb-1', documentNum: 2, graphRag: { enabled: false } })
    const graph = element<HTMLButtonElement>('[data-index-capability="graph"]')
    expect(graph.disabled).toBe(false)
    expect(graph.getAttribute('aria-pressed')).toBe('false')

    graph.click()
    await settle()

    expect(graph.getAttribute('aria-pressed')).toBe('true')
    expect(fixture.componentInstance.retrieval().graphRag?.enabled).toBe(true)
    expect(fixture.componentInstance.wikiEnabled()).toBe(false)
  })

  it.each(['graph', 'hybrid'] as const)(
    'blocks creating Wiki-only %s defaults without a usable source',
    async (mode) => {
      await render({
        ...draft,
        graphRag: { enabled: true },
        recall: {
          mode,
          contentScope: 'wiki',
          fusion: { mode: 'weighted_rrf', weights: { vector: 0, keyword: 0, graph: 1 } }
        }
      })
      await enableWiki()
      expect(fixture.componentInstance.retrievalConfigurationValid()).toBe(false)
      element<HTMLButtonElement>('.kb-footer-primary').click()
      http.expectNone('/api/knowledgebase')
      expect(close).not.toHaveBeenCalled()
    }
  )

  it('renders Wiki controls between the strategy and name and submits their edited values', async () => {
    await render()
    await enableWiki()
    const strategy = element('.kb-choice-grid')
    const settings = element('[data-wiki-generation-settings]')
    const name = element('input[placeholder="' + prefix + '.Basic.NamePlaceholder"]')
    expect(strategy.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(settings.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(Array.from(settings.querySelectorAll('textarea')).map((input) => input.maxLength)).toEqual([4000, 4000])

    element<HTMLElement>('z-toggle-group-item[value="focused"]').click()
    await settle()
    await enter(
      'textarea[placeholder="' + prefix + '.Wiki.ContentGenerationRequirementsPlaceholder"]',
      'Use concise language'
    )
    await enter('textarea[placeholder="' + prefix + '.Wiki.ExtractionFocusPlaceholder"]', 'Product and version')
    element<HTMLButtonElement>('.kb-footer-primary').click()

    const request = http.expectOne('/api/knowledgebase')
    expect(request.request.method).toBe('POST')
    expect(request.request.body).toMatchObject({
      name: 'Wiki test',
      workspaceId: 'workspace-1',
      type: KnowledgebaseTypeEnum.Standard,
      wikiConfig: {
        enabled: true,
        extractionGranularity: 'focused',
        contentGenerationRequirements: 'Use concise language',
        extractionFocus: 'Product and version'
      },
      wikiModel: null,
      chatModel: llm,
      copilotModel: embedding
    })
    request.flush({ id: 'kb-1' })
    expect(close).toHaveBeenCalledWith({ id: 'kb-1' })
  })

  it('renders the dedicated model only for Wiki and preserves LLM fallback when it is unset', async () => {
    await render()
    fixture.componentInstance.activeSection.set('models')
    await settle()
    expect(root.querySelectorAll('copilot-model-select')).toHaveLength(2)
    expect(root.textContent).not.toContain(prefix + '.Models.WikiModelDescription')
    fixture.componentInstance.activeSection.set('basic')
    await settle()
    await enableWiki()
    fixture.componentInstance.activeSection.set('models')
    await settle()
    expect(root.querySelectorAll('copilot-model-select')).toHaveLength(3)
    expect(root.textContent).toContain(prefix + '.Models.WikiModelDescription')
    element<HTMLButtonElement>('.kb-footer-primary').click()
    const request = http.expectOne('/api/knowledgebase')
    expect(request.request.body).toMatchObject({ wikiModel: null, chatModel: llm })
    request.flush({ id: 'kb-1' })
  })

  it.each([true, false])('keeps the existing Wiki strategy locked with documents (enabled=%s)', async (enabled) => {
    await render({
      ...draft,
      id: 'kb-1',
      documentNum: 2,
      wikiConfig: { enabled, extractionGranularity: 'standard' }
    })
    const wiki = element<HTMLButtonElement>('.kb-choice-card:nth-child(2)')
    expect(wiki.disabled).toBe(true)
    expect(root.textContent).toContain(prefix + '.Basic.IndexStrategyLocked')
    wiki.click()
    await settle()
    expect(wiki.getAttribute('aria-pressed')).toBe(String(enabled))
  })

  it('sends a single combined settings request after paid-rebuild confirmation and retains the draft on failure', async () => {
    await render({
      ...draft,
      id: 'kb-1',
      documentNum: 2,
      wikiModel,
      wikiConfig: { enabled: true, extractionGranularity: 'standard' }
    })
    await enter('textarea[placeholder="' + prefix + '.Wiki.ExtractionFocusPlaceholder"]', 'New focus')
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    element<HTMLButtonElement>('.kb-footer-primary').click()
    http.expectNone('/api/knowledgebase/kb-1/wiki/config')
    element<HTMLButtonElement>('.kb-footer-primary').click()
    const request = http.expectOne('/api/knowledgebase/kb-1/wiki/config')
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(request.request.method).toBe('PUT')
    expect(request.request.body).toMatchObject({
      settings: { name: 'Wiki test', chatModel: llm },
      wikiConfig: { enabled: true, extractionFocus: 'New focus' },
      wikiModel,
      confirmModelCharges: true,
      maxModelInvocations: 40,
      maxEstimatedTokens: 400_000
    })
    expect(request.request.body.settings.wikiConfig).toBeUndefined()
    expect(request.request.body.settings.wikiModel).toBeUndefined()
    http.expectNone('/api/knowledgebase/kb-1')
    request.flush({ message: 'Wiki configuration rejected' }, { status: 400, statusText: 'Bad Request' })
    await settle()
    expect(close).not.toHaveBeenCalled()
    expect(toastr.success).not.toHaveBeenCalled()
    expect(toastr.error).toHaveBeenCalled()
    expect(
      element<HTMLTextAreaElement>('textarea[placeholder="' + prefix + '.Wiki.ExtractionFocusPlaceholder"]').value
    ).toBe('New focus')
    expect(element<HTMLButtonElement>('.kb-footer-primary').disabled).toBe(false)
  })
})
