import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core'
import { DialogRef } from '@angular/cdk/dialog'
import { HttpClient } from '@angular/common/http'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardInputDirective,
  ZardComboboxComponent,
  ZardComboboxOptionTemplateDirective,
  XpDialogTitleDirective,
  XpDialogActionsDirective
} from '@xpert-ai/headless-ui'
import type { ChatGroupCandidate } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { API_PREFIX } from '../../../@core/state'
import { EmojiAvatarComponent } from '../../../@shared/avatar/emoji-avatar/avatar.component'

@Component({
  standalone: true,
  selector: 'xp-group-create-dialog',
  imports: [
    TranslateModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    ZardInputDirective,
    ZardComboboxComponent,
    ZardComboboxOptionTemplateDirective,
    EmojiAvatarComponent,
    XpDialogTitleDirective,
    XpDialogActionsDirective
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="w-[min(440px,calc(100vw-32px))] space-y-5 p-6" [formGroup]="form" (ngSubmit)="create()">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 xpDialogTitle class="text-lg font-semibold">{{ 'XP.Groups.New' | translate }}</h2>
          <p class="mt-2 text-sm text-text-secondary">{{ 'XP.Groups.CreateHint' | translate }}</p>
        </div>
        <button
          z-button
          zType="ghost"
          zSize="icon"
          type="button"
          [attr.aria-label]="'XP.Groups.Cancel' | translate"
          [disabled]="creating()"
          (click)="dialog.close()"
        >
          <i class="ri-close-line text-lg"></i>
        </button>
      </div>
      <div class="space-y-2">
        <label for="group-title" class="text-sm font-medium">{{ 'XP.Groups.Name' | translate }}</label>
        <input
          z-input
          id="group-title"
          class="w-full"
          formControlName="title"
          maxlength="200"
          [placeholder]="'XP.Groups.NamePlaceholder' | translate"
        />
      </div>
      <div class="space-y-2">
        <div class="text-sm font-medium">{{ 'XP.Groups.Assistant' | translate }}</div>
        <p id="group-assistant-hint" class="text-xs text-text-tertiary">{{ 'XP.Groups.AssistantHint' | translate }}</p>
        <z-combobox
          formControlName="assistantId"
          zWidth="full"
          [options]="options()"
          [zDisabled]="loading() || creating()"
          [ariaLabel]="'XP.Groups.Assistant' | translate"
          ariaDescribedBy="group-assistant-hint"
          [placeholder]="(loading() ? 'XP.Groups.Loading' : 'XP.Groups.Assistant') | translate"
          [searchPlaceholder]="'XP.Groups.SearchAssistants' | translate"
          [emptyText]="'XP.Groups.NoMatches' | translate"
        >
          <ng-template zComboboxOption let-option>
            <emoji-avatar
              [avatar]="avatarFor(option.value)"
              [alt]="option.label"
              [fallbackLabel]="option.label"
              class="!size-8 shrink-0 overflow-hidden rounded-lg"
            />
            <span class="min-w-0 flex-1 truncate">{{ option.label }}</span>
          </ng-template>
        </z-combobox>
      </div>
      @if (error()) {
        <p role="alert" class="text-sm text-text-warning">{{ error() }}</p>
      }
      <div xpDialogActions align="end">
        <button z-button zType="outline" type="button" [disabled]="creating()" (click)="dialog.close()">
          {{ 'XP.Groups.Cancel' | translate }}
        </button>
        <button z-button type="submit" [zLoading]="creating()" [disabled]="form.invalid || creating()">
          {{ 'XP.Groups.Create' | translate }}
        </button>
      </div>
    </form>
  `
})
export class GroupCreateDialogComponent {
  readonly dialog = inject(DialogRef<string>)
  private readonly http = inject(HttpClient)
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(200), Validators.pattern(/\S/)]
    }),
    assistantId: new FormControl('', { nonNullable: true, validators: Validators.required })
  })
  readonly candidates = signal<ChatGroupCandidate[]>([])
  readonly options = computed(() => this.candidates().map((item) => ({ value: item.subjectId, label: item.name })))
  readonly loading = signal(true)
  readonly creating = signal(false)
  readonly error = signal('')
  constructor() {
    void this.load()
  }
  avatarFor(id: string) {
    return this.candidates().find((item) => item.subjectId === id)?.avatar ?? undefined
  }
  async load() {
    try {
      this.candidates.set(
        await firstValueFrom(
          this.http.get<ChatGroupCandidate[]>(`${API_PREFIX}/ai/groups/candidates`, {
            params: { kind: 'assistant' }
          })
        )
      )
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error))
    } finally {
      this.loading.set(false)
    }
  }
  async create() {
    if (this.form.invalid || this.creating()) return
    this.creating.set(true)
    this.error.set('')
    try {
      const group = await firstValueFrom(
        this.http.post<{ id: string }>(`${API_PREFIX}/ai/groups`, {
          ...this.form.getRawValue(),
          title: this.form.controls.title.value.trim()
        })
      )
      this.dialog.close(group.id)
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error))
      this.creating.set(false)
    }
  }
}
