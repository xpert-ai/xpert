import { Dialog } from '@angular/cdk/dialog'
import { signal } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { ActivatedRoute } from '@angular/router'
import { TranslateService } from '@ngx-translate/core'
import { IKnowledgeFAQEntry, KnowledgebaseStatusEnum } from '@xpert-ai/contracts'
import { of, throwError } from 'rxjs'
import { KnowledgeFAQService, ToastrService } from '../../../../../@core'

jest.mock('../knowledgebase.component', () => ({ KnowledgebaseComponent: class KnowledgebaseComponent {} }))

import { KnowledgebaseComponent } from '../knowledgebase.component'
import { KnowledgeFAQComponent } from './faq.component'

describe('KnowledgeFAQComponent', () => {
  const dialog = { open: jest.fn() }
  const knowledgebase = signal({
    id: 'kb-1',
    status: KnowledgebaseStatusEnum.READY,
    embeddingRebuildError: null as string | null
  })
  const refreshKnowledgebase = jest.fn()
  const queryParamGet = jest.fn((): string | null => null)
  const toastr = { error: jest.fn(), success: jest.fn(), warning: jest.fn() }
  const faqService = {
    findAll: jest.fn(() => of({ items: [], total: 0 })),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    importFile: jest.fn(),
    exportFile: jest.fn()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    dialog.open.mockReturnValue({ closed: of(undefined) })
    faqService.findAll.mockReturnValue(of({ items: [], total: 0 }))
    queryParamGet.mockReturnValue(null)
    knowledgebase.set({ id: 'kb-1', status: KnowledgebaseStatusEnum.READY, embeddingRebuildError: null })
    TestBed.configureTestingModule({
      providers: [
        { provide: Dialog, useValue: dialog },
        { provide: KnowledgeFAQService, useValue: faqService },
        {
          provide: KnowledgebaseComponent,
          useValue: { paramId: signal('kb-1'), knowledgebase, refresh: refreshKnowledgebase }
        },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({}),
            snapshot: {
              params: {},
              queryParamMap: { get: queryParamGet }
            }
          }
        },
        { provide: ToastrService, useValue: toastr },
        { provide: TranslateService, useValue: { instant: jest.fn((key: string) => key) } }
      ]
    })
  })

  afterEach(() => {
    TestBed.resetTestingModule()
  })

  const entry: IKnowledgeFAQEntry = {
    id: 'faq-1',
    knowledgebaseId: 'kb-1',
    standardQuestion: 'How do I reset my password?',
    similarQuestions: ['Password reset'],
    negativeQuestions: ['How do I delete my account?'],
    answerBlocks: ['Follow these steps.'],
    enabled: true,
    version: 1
  }

  it('opens the create editor in the page inspector', () => {
    const component = TestBed.runInInjectionContext(() => new KnowledgeFAQComponent())

    component.openCreate()

    expect(component.inspectorMode()).toBe('create')
    expect(component.selectedEntry()).toBeNull()
    expect(dialog.open).not.toHaveBeenCalled()
  })

  it('opens a selected FAQ in detail mode and can switch to editing', () => {
    const component = TestBed.runInInjectionContext(() => new KnowledgeFAQComponent())

    component.openDetails(entry)
    expect(component.inspectorMode()).toBe('detail')
    expect(component.selectedEntry()).toBe(entry)

    component.openEdit()
    expect(component.inspectorMode()).toBe('edit')
  })

  it('updates the enabled state for selected FAQ entries and clears the selection', async () => {
    faqService.update.mockReturnValue(of({ ...entry, enabled: false, version: 2 }))
    const component = TestBed.runInInjectionContext(() => new KnowledgeFAQComponent())
    component.entries.set([entry])
    component.selectionModel.select(entry.id)

    await component.setSelectedEnabled(false)

    expect(faqService.update).toHaveBeenCalledWith('kb-1', entry.id, {
      standardQuestion: entry.standardQuestion,
      similarQuestions: entry.similarQuestions,
      negativeQuestions: entry.negativeQuestions,
      answerBlocks: entry.answerBlocks,
      enabled: false,
      version: entry.version
    })
    expect(component.selectionModel.hasValue()).toBe(false)
  })

  it('locks FAQ mutations while the embedding vectors are rebuilding', () => {
    knowledgebase.set({ id: 'kb-1', status: KnowledgebaseStatusEnum.REBUILDING, embeddingRebuildError: null })
    const component = TestBed.runInInjectionContext(() => new KnowledgeFAQComponent())

    expect(component.vectorMutationLocked()).toBe(true)
    expect(component.busy()).toBe(true)
  })

  it('keeps polling while embedding vectors are rebuilding and stops afterwards', () => {
    jest.useFakeTimers()
    try {
      knowledgebase.set({ id: 'kb-1', status: KnowledgebaseStatusEnum.REBUILDING, embeddingRebuildError: null })
      TestBed.runInInjectionContext(() => new KnowledgeFAQComponent())
      TestBed.flushEffects()

      jest.advanceTimersByTime(6_000)
      expect(refreshKnowledgebase.mock.calls.length).toBeGreaterThanOrEqual(2)

      knowledgebase.set({ id: 'kb-1', status: KnowledgebaseStatusEnum.READY, embeddingRebuildError: null })
      TestBed.flushEffects()
      const callsAfterReady = refreshKnowledgebase.mock.calls.length
      jest.advanceTimersByTime(3_000)
      expect(refreshKnowledgebase).toHaveBeenCalledTimes(callsAfterReady)
    } finally {
      jest.useRealTimers()
    }
  })

  it('keeps the FAQ list available when a linked FAQ no longer exists', async () => {
    queryParamGet.mockReturnValue('missing-faq')
    faqService.findAll.mockReturnValue(of({ items: [entry], total: 1 }))
    faqService.findOne.mockReturnValue(throwError(() => new Error('FAQ not found')))
    const component = TestBed.runInInjectionContext(() => new KnowledgeFAQComponent())

    await component.load()

    expect(component.entries()).toEqual([entry])
    expect(component.loadError()).toBeNull()
    expect(toastr.warning).toHaveBeenCalledWith(
      'XP.Knowledgebase.FAQManagement.LinkedFAQNotFound',
      expect.objectContaining({ Default: expect.any(String) })
    )
  })

  it('reprocesses selected FAQs through the existing versioned update path', async () => {
    faqService.update.mockReturnValue(of({ ...entry, version: 2 }))
    const component = TestBed.runInInjectionContext(() => new KnowledgeFAQComponent())
    component.entries.set([entry])
    component.selectionModel.select(entry.id)

    await component.reprocessSelected()

    expect(faqService.update).toHaveBeenCalledWith('kb-1', entry.id, {
      standardQuestion: entry.standardQuestion,
      similarQuestions: entry.similarQuestions,
      negativeQuestions: entry.negativeQuestions,
      answerBlocks: entry.answerBlocks,
      enabled: true,
      version: 1
    })
    expect(component.selectionModel.hasValue()).toBe(false)
  })

  it('reprocesses one FAQ through the row action', async () => {
    faqService.update.mockReturnValue(of({ ...entry, version: 2 }))
    const component = TestBed.runInInjectionContext(() => new KnowledgeFAQComponent())

    await component.reprocessEntry(entry)

    expect(faqService.update).toHaveBeenCalledWith('kb-1', entry.id, {
      standardQuestion: entry.standardQuestion,
      similarQuestions: entry.similarQuestions,
      negativeQuestions: entry.negativeQuestions,
      answerBlocks: entry.answerBlocks,
      enabled: true,
      version: 1
    })
    expect(component.reprocessingEntryIds().size).toBe(0)
  })

  it('updates one FAQ enabled state through the row action', async () => {
    faqService.update.mockReturnValue(of({ ...entry, enabled: false, version: 2 }))
    const component = TestBed.runInInjectionContext(() => new KnowledgeFAQComponent())

    await component.setEntryEnabled(entry, false)

    expect(faqService.update).toHaveBeenCalledWith('kb-1', entry.id, {
      standardQuestion: entry.standardQuestion,
      similarQuestions: entry.similarQuestions,
      negativeQuestions: entry.negativeQuestions,
      answerBlocks: entry.answerBlocks,
      enabled: false,
      version: 1
    })
  })

  it('deletes selected FAQs with their optimistic versions', async () => {
    dialog.open.mockReturnValue({ closed: of(true) })
    faqService.delete.mockReturnValue(of({ success: true }))
    const component = TestBed.runInInjectionContext(() => new KnowledgeFAQComponent())
    component.entries.set([entry])
    component.selectionModel.select(entry.id)

    component.deleteSelected()
    await new Promise<void>((resolve) => setTimeout(resolve, 0))

    expect(faqService.delete).toHaveBeenCalledWith('kb-1', entry.id, entry.version)
    expect(component.selectionModel.hasValue()).toBe(false)
  })
})
