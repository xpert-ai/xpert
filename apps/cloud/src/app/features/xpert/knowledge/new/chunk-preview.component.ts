import { Component, effect, inject, input, signal } from '@angular/core'
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  KnowledgebaseParserConfig,
  KnowledgeChunkPreviewResult,
  KnowledgebaseService,
  getErrorMessage
} from '../../../../@core'
import { ZardButtonComponent, ZardFormImports, ZardInputDirective, ZardSelectImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xp-knowledge-chunk-preview',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardFormImports,
    ...ZardSelectImports
  ],
  template: `
    <form [formGroup]="form" (ngSubmit)="preview()" class="mt-5 flex flex-col gap-4">
      <p class="text-sm text-text-tertiary">{{ prefix + '.PreviewHelp' | translate }}</p>
      <z-form-field>
        <label z-form-label>{{ prefix + '.PreviewType' | translate }}</label>
        <z-select formControlName="type">
          <z-select-item zValue="txt">{{ prefix + '.PlainText' | translate }}</z-select-item>
          <z-select-item zValue="md">Markdown</z-select-item>
        </z-select>
      </z-form-field>
      <z-form-field>
        <label z-form-label for="chunk-preview-text">{{ prefix + '.PreviewText' | translate }}</label>
        <textarea z-input id="chunk-preview-text" rows="6" maxlength="100000" formControlName="text"></textarea>
      </z-form-field>
      <button z-button type="submit" class="self-start" [disabled]="loading() || form.invalid">
        {{ (loading() ? prefix + '.PreviewLoading' : prefix + '.PreviewRun') | translate }}
      </button>
      @if (error()) {
        <p role="alert" class="text-sm text-text-destructive">{{ error() }}</p>
      }
      @if (result(); as result) {
        <p class="text-sm text-text-secondary">
          {{ prefix + '.PreviewCount' | translate: { count: result.chunks.length } }}
        </p>
        <div class="max-h-96 overflow-auto">
          @for (chunk of result.chunks; track chunk.metadata.chunkId; let index = $index) {
            <div class="border-b border-divider-subtle py-3">
              <div class="text-sm font-medium">{{ index + 1 }} · {{ chunk.pageContent.length }}</div>
              <pre class="whitespace-pre-wrap break-words text-sm text-text-secondary">{{ chunk.pageContent }}</pre>
              @for (child of chunk.children ?? []; track child.metadata.chunkId; let childIndex = $index) {
                <div class="ml-4 border-l border-divider-subtle pl-3 pt-2">
                  <span class="text-xs text-text-tertiary"
                    >{{ index + 1 }}.{{ childIndex + 1 }} · {{ child.pageContent.length }}</span
                  >
                  <pre class="whitespace-pre-wrap break-words text-sm text-text-secondary">{{ child.pageContent }}</pre>
                </div>
              }
            </div>
          }
        </div>
      }
    </form>
  `
})
export class KnowledgeChunkPreviewComponent {
  readonly prefix = 'XP.Knowledgebase.WorkspaceConfiguration.Implemented'
  readonly workspaceId = input.required<string>()
  readonly config = input.required<KnowledgebaseParserConfig>()
  readonly service = inject(KnowledgebaseService)
  readonly form = inject(NonNullableFormBuilder).group({
    text: ['', [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100000)]],
    type: ['txt' as 'txt' | 'md']
  })
  readonly loading = signal(false)
  readonly error = signal('')
  readonly result = signal<KnowledgeChunkPreviewResult | null>(null)
  private revision = 0

  constructor() {
    effect(() => {
      this.config()
      this.revision++
      this.result.set(null)
    })
    this.form.valueChanges.subscribe(() => {
      this.revision++
      this.result.set(null)
    })
  }

  async preview() {
    if (this.loading() || this.form.invalid) return
    const revision = this.revision
    this.loading.set(true)
    this.error.set('')
    this.result.set(null)
    try {
      const result = await firstValueFrom(
        this.service.previewChunks(this.workspaceId(), {
          ...this.form.getRawValue(),
          parserConfig: this.config()
        })
      )
      if (revision === this.revision) this.result.set(result)
    } catch (error) {
      if (revision === this.revision) this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
}
