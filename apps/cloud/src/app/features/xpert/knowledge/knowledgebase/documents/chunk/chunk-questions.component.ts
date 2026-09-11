import { Component, computed, DestroyRef, inject, input, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { IDocChunkMetadata, IKnowledgeDocumentChunk, KnowledgeChunkQuestions } from '@xpert-ai/contracts'
import { ZardAccordionImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { getErrorMessage, injectToastr, KnowledgeDocumentService } from '@cloud/app/@core'

@Component({
  selector: 'xp-knowledge-chunk-questions',
  standalone: true,
  imports: [TranslateModule, ...ZardAccordionImports, ZardButtonComponent],
  template: `
    @if (chunk().metadata?.children?.length) {
      @for (child of chunk().metadata.children; track child.id; let i = $index) {
        <xp-knowledge-chunk-questions
          [documentId]="documentId()"
          [chunk]="child"
          [chunkLabel]="(chunkLabel() ? chunkLabel() + '-' : 'C-') + (i + 1)"
        />
      }
    } @else if (!chunk().metadata?.mediaType || chunk().metadata.mediaType === 'text') {
      <z-accordion class="block px-3" zType="single" zCollapsible>
        <z-accordion-item
          [zValue]="'questions-' + chunk().id"
          [zTitle]="(chunkLabel() ? chunkLabel() + ' · ' : '') + ('XP.Knowledgebase.Questions.Title' | translate)"
          (opened)="open()"
          (closed)="close()"
        >
          <div class="space-y-3 py-3">
            @if (loading() && !loaded()) {
              <p class="text-sm text-text-tertiary">{{ 'XP.Knowledgebase.Questions.Loading' | translate }}</p>
            }
            @if (loaded()) {
              @if (pending()) {
                <p class="text-sm text-text-tertiary">{{ 'XP.Knowledgebase.Questions.Generating' | translate }}</p>
              }
              @if (state()?.error) {
                <p class="text-sm text-text-destructive">{{ state().error }}</p>
              }
              @for (question of state()?.questions ?? []; track question.id) {
                <div class="flex items-start justify-between gap-3">
                  <span class="text-sm leading-6">{{ question.question }}</span>
                  <button
                    z-button
                    zType="ghost"
                    zSize="sm"
                    [zDisabled]="busy() || pending()"
                    (click)="remove(question.id)"
                  >
                    {{ 'XP.ACTIONS.Delete' | translate }}
                  </button>
                </div>
              } @empty {
                @if (!pending() && state()?.status !== 'failed') {
                  <p class="text-sm text-text-tertiary">{{ emptyKey() | translate }}</p>
                }
              }
              @if (!pending()) {
                <p class="text-xs leading-5 text-text-tertiary">
                  {{ helpKey() | translate }}
                </p>
              }
              <button
                z-button
                zType="outline"
                zSize="sm"
                [zDisabled]="!enabled() || busy() || pending()"
                (click)="regenerate()"
              >
                {{ actionKey() | translate }}
              </button>
            }
          </div>
        </z-accordion-item>
      </z-accordion>
    }
  `
})
export class KnowledgeChunkQuestionsComponent {
  readonly documentId = input.required<string>()
  readonly chunk = input.required<IKnowledgeDocumentChunk<IDocChunkMetadata>>()
  readonly chunkLabel = input<string>()
  readonly state = signal<KnowledgeChunkQuestions | undefined>(undefined)
  readonly enabled = signal(false)
  readonly waiting = signal(false)
  readonly busy = signal(false)
  readonly loading = signal(false)
  readonly loaded = signal(false)
  readonly pending = computed(() => this.waiting() || this.state()?.status === 'generating')
  readonly actionKey = computed(
    () =>
      'XP.Knowledgebase.Questions.' +
      (this.state()?.status === 'failed' ? 'Retry' : this.state() ? 'Regenerate' : 'Generate')
  )
  readonly emptyKey = computed(
    () =>
      'XP.Knowledgebase.Questions.' +
      (this.state()?.emptyReason === 'insufficient_content' ? 'InsufficientContent' : 'Empty')
  )
  readonly helpKey = computed(
    () =>
      'XP.Knowledgebase.Questions.' +
      (!this.enabled()
        ? 'DisabledHelp'
        : this.state()?.status === 'failed' && this.state()?.questions.length
          ? 'RetryIndexHelp'
          : 'ManageHelp')
  )
  private readonly api = inject(KnowledgeDocumentService)
  private readonly toastr = injectToastr()
  private readonly destroyRef = inject(DestroyRef)
  private expanded = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private deadline = 0

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.timer))
  }

  open() {
    this.expanded = true
    clearTimeout(this.timer)
    void this.refresh()
  }

  close() {
    this.expanded = false
    clearTimeout(this.timer)
  }

  private async refresh() {
    this.loading.set(true)
    try {
      const result = await firstValueFrom(this.api.getChunkQuestions(this.documentId(), this.chunk().id))
      if (this.destroyRef.destroyed) return
      const changed = result.state?.generationId !== this.state()?.generationId
      this.state.set(result.state)
      this.enabled.set(result.enabled)
      this.loaded.set(true)
      if (changed || Date.now() > this.deadline) this.waiting.set(false)
      if (this.expanded && (result.state?.status === 'generating' || this.waiting())) {
        this.timer = setTimeout(() => void this.refresh(), 3000)
      }
    } catch (error) {
      this.waiting.set(false)
      this.toastr.error(getErrorMessage(error))
    } finally {
      if (!this.destroyRef.destroyed) this.loading.set(false)
    }
  }

  async regenerate() {
    this.busy.set(true)
    try {
      await firstValueFrom(this.api.regenerateChunkQuestions(this.documentId(), this.chunk().id))
      this.waiting.set(true)
      this.deadline = Date.now() + 120000
      clearTimeout(this.timer)
      await this.refresh()
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }

  async remove(questionId: string) {
    this.busy.set(true)
    try {
      this.state.set(await firstValueFrom(this.api.deleteChunkQuestion(this.documentId(), this.chunk().id, questionId)))
    } catch (error) {
      this.toastr.error(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
}
