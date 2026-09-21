import { ASSISTANT_SETTINGS_CONTEXT } from '../../../@shared/xpert/assistant-settings/assistant-settings-context'
import { ChangeDetectionStrategy, Component, effect, inject, input, OnDestroy, signal, untracked } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import {
  AssistantBindingScope,
  AssistantBindingService,
  AssistantCode,
  getErrorMessage,
  ToastrService
} from '../../../@core'
import { countDisplayTextUnits } from '../../../@shared/text-count.utils'
import { ClawXpertFacade } from '../../chat/clawxpert/clawxpert.facade'

type PersonalizationDocuments = { soul: string; profile: string }

@Component({
  standalone: true,
  selector: 'xp-assistant-personalization',
  imports: [ReactiveFormsModule, TranslateModule, ZardButtonComponent, ZardInputDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (facade.loading() || loading()) {
      <p role="status" class="py-12 text-center text-sm text-muted-foreground">
        {{ 'XP.Chat.ClawXpert.LoadingPreference' | translate }}
      </p>
    } @else if (facade.viewState() !== 'ready' || !facade.resolvedPreference()) {
      <p
        role="status"
        class="rounded-lg border border-dashed border-border p-6 text-sm leading-6 text-muted-foreground"
      >
        {{ 'XP.AssistantSettings.BindingRequired' | translate }}
      </p>
    } @else if (loadError()) {
      <div role="alert" class="space-y-3 rounded-lg border border-border p-4">
        <p class="text-sm text-destructive">{{ loadError() }}</p>
        <button z-button zType="outline" type="button" (click)="load()">
          {{ 'XP.AssistantSettings.Retry' | translate }}
        </button>
      </div>
    } @else {
      <form [formGroup]="form" (ngSubmit)="save()">
        @if (showIntro()) {
          <p class="mb-6 text-sm leading-6 text-muted-foreground">
            {{ 'XP.AssistantSettings.PersonalizationIntro' | translate }}
          </p>
        }
        <section>
          <div class="flex items-center justify-between gap-3">
            <label for="assistant-soul" class="text-base font-semibold">{{
              'XP.Chat.ClawXpert.TabBehavior' | translate
            }}</label>
            <span class="text-xs text-muted-foreground">SOUL.md</span>
          </div>
          <p id="assistant-soul-hint" class="mb-3 mt-2 text-sm leading-6 text-muted-foreground">
            {{ 'XP.AssistantSettings.BehaviorHelp' | translate }}
          </p>
          <textarea
            z-input
            id="assistant-soul"
            formControlName="soul"
            rows="9"
            class="resize-y leading-6"
            aria-describedby="assistant-soul-hint"
            [readonly]="saving()"
            [placeholder]="'XP.AssistantSettings.BehaviorPlaceholder' | translate"
          ></textarea>
          <div class="mt-2 flex justify-between gap-3 text-xs text-muted-foreground">
            <span>{{ 'XP.AssistantSettings.MarkdownHelp' | translate }}</span>
            <span>{{ 'XP.Chat.ClawXpert.WordCount' | translate: { count: count(form.controls.soul.value) } }}</span>
          </div>
        </section>
        <section class="mt-6 border-t border-border pt-6">
          <div class="flex items-center justify-between gap-3">
            <label for="assistant-profile" class="text-base font-semibold">{{
              'XP.Chat.ClawXpert.TabUserProfile' | translate
            }}</label>
            <span class="text-xs text-muted-foreground">USER.md</span>
          </div>
          <p id="assistant-profile-hint" class="mb-3 mt-2 text-sm leading-6 text-muted-foreground">
            {{ 'XP.AssistantSettings.ProfileHelp' | translate }}
          </p>
          <textarea
            z-input
            id="assistant-profile"
            formControlName="profile"
            rows="8"
            class="resize-y leading-6"
            aria-describedby="assistant-profile-hint"
            [readonly]="saving()"
            [placeholder]="'XP.AssistantSettings.ProfilePlaceholder' | translate"
          ></textarea>
          <div class="mt-2 flex justify-between gap-3 text-xs text-muted-foreground">
            <span>{{ 'XP.AssistantSettings.MarkdownHelp' | translate }}</span>
            <span>{{ 'XP.Chat.ClawXpert.WordCount' | translate: { count: count(form.controls.profile.value) } }}</span>
          </div>
        </section>
        @if (saveError()) {
          <p role="alert" class="mt-4 text-sm text-destructive">{{ saveError() }}</p>
        }
        @if (saved() && !dirty) {
          <p role="status" class="mt-4 text-sm text-muted-foreground">
            {{ 'XP.AssistantSettings.PersonalizationSaved' | translate }}
          </p>
        }
        @if (showFooter()) {
          <footer
            class="sticky -bottom-6 -mx-6 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-6 py-4"
          >
            <p class="text-xs text-muted-foreground">
              {{
                (dirty ? 'XP.AssistantSettings.UnsavedChanges' : 'XP.AssistantSettings.PersonalizationSaveHint')
                  | translate
              }}
            </p>
            <div class="flex gap-2">
              <button z-button zType="outline" type="button" [zDisabled]="saving() || !dirty" (click)="reset()">
                {{ 'XP.Common.Reset' | translate }}
              </button>
              <button z-button type="submit" [zDisabled]="saving() || facade.savingUserPreference() || !dirty">
                {{ (saving() ? 'XP.AssistantSettings.Saving' : 'XP.KEY_WORDS.Save') | translate }}
              </button>
            </div>
          </footer>
        }
      </form>
    }
  `
})
export class AssistantPersonalizationComponent implements OnDestroy {
  readonly showFooter = input(true)
  readonly showIntro = input(true)
  readonly facade = inject(ASSISTANT_SETTINGS_CONTEXT, { optional: true }) ?? inject(ClawXpertFacade)
  private readonly api = inject(AssistantBindingService)
  private readonly translate = inject(TranslateService)
  private readonly toastr = inject(ToastrService)
  readonly form = new FormGroup({
    soul: new FormControl('', { nonNullable: true }),
    profile: new FormControl('', { nonNullable: true })
  })
  readonly loading = signal(false)
  readonly saving = signal(false)
  readonly saved = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly saveError = signal<string | null>(null)
  readonly count = countDisplayTextUnits
  private baseline: PersonalizationDocuments = { soul: '', profile: '' }
  private requestId = 0
  private bindingKey = ''

  get dirty() {
    const value = this.form.getRawValue()
    return value.soul !== this.baseline.soul || value.profile !== this.baseline.profile
  }

  constructor() {
    effect(() => {
      const organizationId = this.facade.organizationId()
      const assistantId = this.facade.resolvedPreference()?.assistantId
      untracked(() => {
        this.requestId++
        this.bindingKey = organizationId && assistantId ? `${organizationId}/${assistantId}` : ''
        this.baseline = { soul: '', profile: '' }
        this.reset()
        this.loading.set(false)
        this.loadError.set(null)
        if (this.bindingKey) void this.load()
      })
    })
  }

  async load() {
    if (!this.bindingKey) return
    const requestId = ++this.requestId
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const preference = await firstValueFrom(
        this.api.getPreference(
          this.facade.resolvedPreference()?.code ?? AssistantCode.CLAWXPERT,
          AssistantBindingScope.USER
        )
      )
      if (requestId !== this.requestId) return
      this.baseline = { soul: preference?.soul ?? '', profile: preference?.profile ?? '' }
      this.reset()
    } catch (error) {
      if (requestId === this.requestId)
        this.loadError.set(
          getErrorMessage(error) || this.translate.instant('XP.AssistantSettings.PreferenceLoadFailed')
        )
    } finally {
      if (requestId === this.requestId) this.loading.set(false)
    }
  }

  reset() {
    this.form.reset(this.baseline)
    this.saved.set(false)
    this.saveError.set(null)
  }

  async save() {
    if (
      this.loading() ||
      this.loadError() ||
      this.saving() ||
      this.facade.savingUserPreference() ||
      !this.dirty ||
      !this.bindingKey ||
      this.facade.viewState() !== 'ready'
    )
      return
    const bindingKey = this.bindingKey
    this.saving.set(true)
    this.saved.set(false)
    this.saveError.set(null)
    try {
      const preference = await this.facade.saveUserPreference(this.form.getRawValue())
      if (bindingKey !== this.bindingKey) return
      if (preference) {
        this.baseline = { soul: preference.soul ?? '', profile: preference.profile ?? '' }
        this.form.reset(this.baseline)
        this.saved.set(true)
      } else this.saveError.set(this.translate.instant('XP.Chat.ClawXpert.PreferenceSaveFailed'))
    } catch (error) {
      const message = getErrorMessage(error) || this.translate.instant('XP.Chat.ClawXpert.PreferenceSaveFailed')
      if (bindingKey === this.bindingKey) this.saveError.set(message)
      this.toastr.error(message)
    } finally {
      this.saving.set(false)
    }
  }

  ngOnDestroy() {
    this.requestId++
  }
}
