import { Component, DestroyRef, effect, inject, input, model, OnInit, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  DEFAULT_KNOWLEDGE_KEYWORD_ANALYZER,
  KnowledgeKeywordAnalyzer,
  KnowledgeKeywordAnalyzerOption
} from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardFormImports, ZardSelectImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, KnowledgebaseService, ToastrService } from '../../../../@core'

@Component({
  selector: 'xp-keyword-analyzer-settings',
  standalone: true,
  imports: [ReactiveFormsModule, TranslateModule, ZardButtonComponent, ...ZardFormImports, ...ZardSelectImports],
  template: `
    <div class="mb-6 space-y-2 border-b border-divider-subtle pb-6" [formGroup]="form">
      <z-form-field>
        <label z-form-label>{{ prefix + 'Label' | translate }}</label>
        <z-select class="w-full" formControlName="provider">
          @if (analyzer() === null) {
            <z-select-item zValue="legacy">{{ prefix + 'Legacy' | translate }}</z-select-item>
          }
          @if (analyzer() && !selectedAvailable()) {
            <z-select-item [zValue]="analyzer()!.provider">{{ analyzer()!.provider }}</z-select-item>
          }
          @for (option of options(); track option.analyzer.provider) {
            <z-select-item [zValue]="option.analyzer.provider">{{ option.label }}</z-select-item>
          }
        </z-select>
      </z-form-field>
      <p class="text-sm text-text-tertiary">{{ prefix + (locked() ? 'Locked' : 'Help') | translate }}</p>
      @if (loading()) {
        <p class="text-sm text-text-tertiary">{{ prefix + 'Loading' | translate }}</p>
      }
      @if (failed()) {
        <button z-button zType="ghost" type="button" (click)="load()">{{ prefix + 'Retry' | translate }}</button>
      }
    </div>
  `
})
export class KeywordAnalyzerSettingsComponent implements OnInit {
  private readonly service = inject(KnowledgebaseService)
  private readonly toastr = inject(ToastrService)
  private readonly destroyRef = inject(DestroyRef)
  readonly prefix = 'XP.Knowledgebase.KeywordAnalyzer.'
  readonly analyzer = model<KnowledgeKeywordAnalyzer | null | undefined>()
  readonly locked = input(false)
  readonly options = signal<KnowledgeKeywordAnalyzerOption[]>([])
  readonly loading = signal(true)
  readonly failed = signal(false)
  readonly form = new FormGroup({
    provider: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  })

  constructor() {
    effect(() => {
      this.form.controls.provider.setValue(this.analyzer()?.provider ?? (this.analyzer() === null ? 'legacy' : ''), {
        emitEvent: false
      })
      if (this.locked() || this.loading() || this.failed()) this.form.disable({ emitEvent: false })
      else this.form.enable({ emitEvent: false })
    })
    this.form.controls.provider.valueChanges.pipe(takeUntilDestroyed()).subscribe((provider) => {
      if (this.locked()) return
      const option = this.options().find((item) => item.analyzer.provider === provider)
      if (option) this.analyzer.set(option.analyzer)
    })
  }

  ngOnInit() {
    void this.load()
  }

  selectedAvailable() {
    return this.options().some((option) => option.analyzer.provider === this.analyzer()?.provider)
  }

  async load() {
    this.loading.set(true)
    this.failed.set(false)
    try {
      const options = await firstValueFrom(this.service.getKeywordAnalyzers())
      if (this.destroyRef.destroyed) return
      this.options.set(options)
      if (this.analyzer() === undefined && !this.locked()) {
        this.analyzer.set(
          options.find((option) => option.analyzer.provider === DEFAULT_KNOWLEDGE_KEYWORD_ANALYZER)?.analyzer
        )
      }
    } catch (error) {
      if (!this.destroyRef.destroyed) {
        this.failed.set(true)
        this.toastr.error(getErrorMessage(error))
      }
    } finally {
      if (!this.destroyRef.destroyed) this.loading.set(false)
    }
  }
}
