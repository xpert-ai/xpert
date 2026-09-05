import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core'
import { FormControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  XpSpinComponent,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardFormImports,
  ZardIconComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import {
  IKnowledgeFAQEntry,
  KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT,
  KNOWLEDGE_FAQ_ANSWER_TOTAL_MAX_LENGTH,
  KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_COUNT,
  KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_LENGTH,
  KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT,
  KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_LENGTH,
  KNOWLEDGE_FAQ_STANDARD_QUESTION_MAX_LENGTH
} from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, KnowledgeFAQService, ToastrService } from '../../../../../@core'
import {
  getKnowledgeFAQLength,
  KnowledgeFAQFormValidationError,
  normalizeKnowledgeFAQFormValue,
  validateKnowledgeFAQFormValue
} from './faq-form'

@Component({
  standalone: true,
  selector: 'xp-knowledge-faq-editor',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    XpSpinComponent,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardFormImports
  ],
  templateUrl: './faq-editor.component.html',
  host: {
    class: 'flex h-full min-h-0 w-full flex-col'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class KnowledgeFAQEditorComponent {
  readonly #faqService = inject(KnowledgeFAQService)
  readonly #formBuilder = inject(NonNullableFormBuilder)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)

  readonly knowledgebaseId = input.required<string>()
  readonly entry = input<IKnowledgeFAQEntry | null>(null)
  readonly cancelled = output<void>()
  readonly saved = output<IKnowledgeFAQEntry>()

  readonly standardQuestionMaxLength = KNOWLEDGE_FAQ_STANDARD_QUESTION_MAX_LENGTH
  readonly similarQuestionMaxCount = KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_COUNT
  readonly similarQuestionMaxLength = KNOWLEDGE_FAQ_SIMILAR_QUESTION_MAX_LENGTH
  readonly negativeQuestionMaxCount = KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_COUNT
  readonly negativeQuestionMaxLength = KNOWLEDGE_FAQ_NEGATIVE_QUESTION_MAX_LENGTH
  readonly answerBlockMaxCount = KNOWLEDGE_FAQ_ANSWER_BLOCK_MAX_COUNT
  readonly answerTotalMaxLength = KNOWLEDGE_FAQ_ANSWER_TOTAL_MAX_LENGTH
  readonly saving = signal(false)

  readonly form = this.#formBuilder.group({
    standardQuestion: this.#formBuilder.control(''),
    similarQuestions: this.#formBuilder.array<FormControl<string>>([]),
    negativeQuestions: this.#formBuilder.array<FormControl<string>>([]),
    answerBlocks: this.#formBuilder.array<FormControl<string>>([this.#formBuilder.control('')]),
    enabled: this.#formBuilder.control(true)
  })

  readonly similarQuestions = this.form.controls.similarQuestions
  readonly negativeQuestions = this.form.controls.negativeQuestions
  readonly answerBlocks = this.form.controls.answerBlocks

  constructor() {
    effect(() => this.resetForm(this.entry()))
  }

  answerTotalLength() {
    return this.answerBlocks.controls.reduce((total, control) => total + getKnowledgeFAQLength(control.value), 0)
  }

  addSimilarQuestion() {
    if (this.similarQuestions.length < this.similarQuestionMaxCount) {
      this.similarQuestions.push(this.#formBuilder.control(''))
    }
  }

  removeSimilarQuestion(index: number) {
    this.similarQuestions.removeAt(index)
  }

  addNegativeQuestion() {
    if (this.negativeQuestions.length < this.negativeQuestionMaxCount) {
      this.negativeQuestions.push(this.#formBuilder.control(''))
    }
  }

  removeNegativeQuestion(index: number) {
    this.negativeQuestions.removeAt(index)
  }

  addAnswerBlock() {
    if (this.answerBlocks.length < this.answerBlockMaxCount) {
      this.answerBlocks.push(this.#formBuilder.control(''))
    }
  }

  removeAnswerBlock(index: number) {
    if (this.answerBlocks.length > 1) this.answerBlocks.removeAt(index)
  }

  length(value: string) {
    return getKnowledgeFAQLength(value)
  }

  close() {
    if (!this.saving()) this.cancelled.emit()
  }

  async save() {
    if (this.saving()) return
    const value = this.form.getRawValue()
    const validationError = validateKnowledgeFAQFormValue(value)
    if (validationError) {
      this.#toastr.error(this.validationMessage(validationError))
      return
    }

    this.saving.set(true)
    try {
      const input = normalizeKnowledgeFAQFormValue(value)
      const entry = this.entry()
      const saved = entry
        ? await firstValueFrom(
            this.#faqService.update(this.knowledgebaseId(), entry.id, { ...input, version: entry.version })
          )
        : await firstValueFrom(this.#faqService.create(this.knowledgebaseId(), input))
      this.#toastr.success(
        entry ? 'XP.Messages.SavedSuccessfully' : 'XP.Messages.CreatedSuccessfully',
        entry ? { Default: 'FAQ saved successfully' } : { Default: 'FAQ created successfully' }
      )
      this.saved.emit(saved)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.saving.set(false)
    }
  }

  private validationMessage(error: KnowledgeFAQFormValidationError) {
    return this.#translate.instant(`XP.Knowledgebase.FAQManagement.Validation.${error}`, { Default: error })
  }

  private resetForm(entry: IKnowledgeFAQEntry | null) {
    this.form.controls.standardQuestion.setValue(entry?.standardQuestion ?? '')
    this.form.controls.enabled.setValue(entry?.enabled ?? true)

    this.similarQuestions.clear()
    for (const value of entry?.similarQuestions ?? []) {
      this.similarQuestions.push(this.#formBuilder.control(value))
    }

    this.negativeQuestions.clear()
    for (const value of entry?.negativeQuestions ?? []) {
      this.negativeQuestions.push(this.#formBuilder.control(value))
    }

    this.answerBlocks.clear()
    for (const value of entry?.answerBlocks.length ? entry.answerBlocks : ['']) {
      this.answerBlocks.push(this.#formBuilder.control(value))
    }
    this.form.markAsPristine()
  }
}
