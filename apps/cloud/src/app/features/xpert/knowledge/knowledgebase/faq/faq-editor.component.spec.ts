import { ComponentFixture, TestBed } from '@angular/core/testing'
import { TranslateModule } from '@ngx-translate/core'
import { IKnowledgeFAQEntry } from '@xpert-ai/contracts'
import { of } from 'rxjs'
import { KnowledgeFAQService, ToastrService } from '../../../../../@core'
import { KnowledgeFAQEditorComponent } from './faq-editor.component'

describe('KnowledgeFAQEditorComponent', () => {
  const faqService = {
    create: jest.fn(),
    update: jest.fn()
  }
  const toastr = { error: jest.fn(), success: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    TestBed.configureTestingModule({
      imports: [KnowledgeFAQEditorComponent, TranslateModule.forRoot()],
      providers: [
        { provide: KnowledgeFAQService, useValue: faqService },
        { provide: ToastrService, useValue: toastr }
      ]
    })
  })

  function createEditor(entry?: IKnowledgeFAQEntry): ComponentFixture<KnowledgeFAQEditorComponent> {
    const fixture = TestBed.createComponent(KnowledgeFAQEditorComponent)
    fixture.componentRef.setInput('knowledgebaseId', 'kb-1')
    fixture.componentRef.setInput('entry', entry ?? null)
    fixture.detectChanges()
    return fixture
  }

  it('caps repeatable controls at ten similar questions, ten negative questions and five answer blocks', () => {
    const fixture = createEditor()
    const component = fixture.componentInstance

    for (let index = 0; index < 12; index++) component.addSimilarQuestion()
    for (let index = 0; index < 12; index++) component.addNegativeQuestion()
    for (let index = 0; index < 8; index++) component.addAnswerBlock()

    expect(component.similarQuestions.length).toBe(10)
    expect(component.negativeQuestions.length).toBe(10)
    expect(component.answerBlocks.length).toBe(5)
    expect(fixture.nativeElement.querySelector('z-switch')).toBeNull()
    expect(fixture.nativeElement.querySelector('#faq-standard-question')?.tagName).toBe('INPUT')
  })

  it('submits a normalized create payload and emits the saved FAQ', async () => {
    const saved: IKnowledgeFAQEntry = {
      id: 'faq-1',
      knowledgebaseId: 'kb-1',
      standardQuestion: 'Reset password?',
      similarQuestions: ['Password reset'],
      negativeQuestions: ['Delete my account'],
      answerBlocks: ['Follow these steps.'],
      enabled: true,
      version: 1
    }
    faqService.create.mockReturnValue(of(saved))
    const component = createEditor().componentInstance
    const savedHandler = jest.fn()
    component.saved.subscribe(savedHandler)
    component.form.controls.standardQuestion.setValue('  Reset password?  ')
    component.addSimilarQuestion()
    component.similarQuestions.at(0).setValue(' Password reset ')
    component.addNegativeQuestion()
    component.negativeQuestions.at(0).setValue(' Delete my account ')
    component.answerBlocks.at(0).setValue(' Follow these steps. ')

    await component.save()

    expect(faqService.create).toHaveBeenCalledWith('kb-1', {
      standardQuestion: 'Reset password?',
      similarQuestions: ['Password reset'],
      negativeQuestions: ['Delete my account'],
      answerBlocks: ['Follow these steps.'],
      enabled: true
    })
    expect(savedHandler).toHaveBeenCalledWith(saved)
  })

  it('preserves the existing enabled status when editing without a status control', async () => {
    const entry: IKnowledgeFAQEntry = {
      id: 'faq-2',
      knowledgebaseId: 'kb-1',
      standardQuestion: 'Legacy question?',
      similarQuestions: [],
      negativeQuestions: ['Unrelated legacy question?'],
      answerBlocks: ['Legacy answer.'],
      enabled: false,
      version: 3
    }
    faqService.update.mockReturnValue(of({ ...entry, standardQuestion: 'Updated question?' }))
    const component = createEditor(entry).componentInstance
    component.form.controls.standardQuestion.setValue('Updated question?')

    await component.save()

    expect(faqService.update).toHaveBeenCalledWith('kb-1', 'faq-2', {
      standardQuestion: 'Updated question?',
      similarQuestions: [],
      negativeQuestions: ['Unrelated legacy question?'],
      answerBlocks: ['Legacy answer.'],
      enabled: false,
      version: 3
    })
  })
})
