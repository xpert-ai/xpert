jest.mock('@cloud/app/@core', () => ({
  ...jest.requireActual('@cloud/app/@core'),
  injectToastr: () => ({ error: jest.fn() })
}))
import { TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { Observable, of, Subject } from 'rxjs'
import { KnowledgeDocumentService } from '@cloud/app/@core'
import { KnowledgeChunkQuestions } from '@xpert-ai/contracts'
import { KnowledgeChunkQuestionsComponent } from './chunk-questions.component'

const state: KnowledgeChunkQuestions = {
  status: 'ready',
  generationId: 'generation',
  sourceHash: 'source',
  inputHash: 'input',
  updatedAt: '2026-09-10T00:00:00Z',
  questions: [{ id: 'q1', question: 'How to apply?', vectorIds: ['vector'] }],
  vectorIds: ['vector']
}

describe('chunk questions management', () => {
  function setup(result: { enabled: boolean; state?: KnowledgeChunkQuestions } = { enabled: true, state }) {
    const api = {
      getChunkQuestions: jest.fn((): Observable<typeof result> => of(result)),
      regenerateChunkQuestions: jest.fn(() => of({ queued: true })),
      deleteChunkQuestion: jest.fn(() => of({ ...state, questions: [], vectorIds: [] }))
    }
    TestBed.configureTestingModule({
      imports: [KnowledgeChunkQuestionsComponent, TranslateModule.forRoot()],
      providers: [{ provide: KnowledgeDocumentService, useValue: api }]
    })
    const fixture = TestBed.createComponent(KnowledgeChunkQuestionsComponent)
    fixture.componentRef.setInput('documentId', 'doc')
    fixture.componentRef.setInput('chunk', { id: 'chunk', pageContent: 'Source', metadata: { chunkId: 'logical' } })
    fixture.detectChanges()
    return { fixture, api, component: fixture.componentInstance, root: fixture.nativeElement as HTMLElement }
  }
  afterEach(() => TestBed.resetTestingModule())

  it.each([
    { enabled: false, state, hint: 'DisabledHelp', action: 'Regenerate', disabled: true },
    { enabled: true, state, hint: 'ManageHelp', action: 'Regenerate', disabled: false },
    {
      enabled: true,
      state: { ...state, status: 'failed' as const, error: 'Index failed' },
      hint: 'RetryIndexHelp',
      action: 'Retry',
      disabled: false
    },
    {
      enabled: true,
      state: { ...state, questions: [], emptyReason: 'insufficient_content' as const },
      hint: 'InsufficientContent',
      action: 'Regenerate',
      disabled: false
    },
    { enabled: true, state: undefined, hint: 'Empty', action: 'Generate', disabled: false }
  ])('shows accurate question state: $hint', async ({ hint, action, disabled, ...result }) => {
    const { root, fixture } = setup(result)
    root.querySelector<HTMLElement>('[role="button"]').click()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(root.textContent).toContain(`XP.Knowledgebase.Questions.${hint}`)
    if (result.enabled) expect(root.textContent).not.toContain('XP.Knowledgebase.Questions.DisabledHelp')
    const button = [...root.querySelectorAll('button')].find((item) => item.textContent.includes(`Questions.${action}`))
    expect(button).toBeDefined()
    expect(button.disabled).toBe(disabled)
  })

  it('does not show an empty or disabled state while loading or generating', async () => {
    const { root, fixture, api } = setup()
    const result = new Subject<{ enabled: boolean; state?: KnowledgeChunkQuestions }>()
    api.getChunkQuestions.mockReturnValue(result)
    root.querySelector<HTMLElement>('[role="button"]').click()
    fixture.detectChanges()
    expect(root.textContent).toContain('XP.Knowledgebase.Questions.Loading')
    expect(root.textContent).not.toContain('XP.Knowledgebase.Questions.Empty')
    expect(root.textContent).not.toContain('XP.Knowledgebase.Questions.DisabledHelp')
    result.next({ enabled: true, state: { ...state, status: 'generating', questions: [] } })
    await Promise.resolve()
    fixture.detectChanges()
    expect(root.textContent).toContain('XP.Knowledgebase.Questions.Generating')
    expect(root.textContent).not.toContain('XP.Knowledgebase.Questions.Empty')
    fixture.destroy()
  })

  it('loads lazily through the accordion keyboard action and refreshes when reopened', async () => {
    const { fixture, api, root } = setup()
    expect(api.getChunkQuestions).not.toHaveBeenCalled()
    const trigger = root.querySelector<HTMLElement>('[role="button"]')
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await fixture.whenStable()
    fixture.detectChanges()
    expect(api.getChunkQuestions).toHaveBeenCalledWith('doc', 'chunk')
    expect(root.textContent).toContain('How to apply?')
    trigger.click()
    trigger.click()
    await fixture.whenStable()
    expect(api.getChunkQuestions).toHaveBeenCalledTimes(2)
  })

  it('deletes the selected question and exposes regeneration through the same source ids', async () => {
    const { component, api, fixture } = setup()
    component.open()
    await fixture.whenStable()
    await component.remove('q1')
    expect(api.deleteChunkQuestion).toHaveBeenCalledWith('doc', 'chunk', 'q1')
    expect(component.state().questions).toEqual([])
    await component.regenerate()
    expect(api.regenerateChunkQuestions).toHaveBeenCalledWith('doc', 'chunk')
    fixture.destroy()
  })

  it('does not render question actions for an image chunk', () => {
    const { fixture, root } = setup()
    fixture.componentRef.setInput('chunk', { id: 'image', metadata: { chunkId: 'image', mediaType: 'image' } })
    fixture.detectChanges()
    expect(root.querySelector('z-accordion')).toBeNull()
  })
})
