import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ICopilotModel, ParameterRule, transitionModelParameters } from '@xpert-ai/contracts'
import { XpDialogFrameImports, XpI18nPipe, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { CopilotProviderService, getErrorMessage } from '../../../@core'
import { ModelParameterInputComponent } from '../model-parameter-input/input.component'

@Component({
  standalone: true,
  selector: 'xp-model-parameters-dialog',
  imports: [
    FormsModule,
    TranslateModule,
    XpI18nPipe,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ModelParameterInputComponent
  ],
  template: `<section xpDialogLayout="standard" class="w-[min(600px,calc(100vw-32px))] max-h-[84dvh]">
    <header xpDialogHeader>
      <h2 xpDialogHeading>{{ 'XP.Copilot.Parameters' | translate }}</h2>
      <p xpDialogDescription>{{ data.model.model }}</p>
      <button
        xpDialogCloseButton
        z-button
        zType="ghost"
        zSize="icon"
        (click)="dialog.close()"
        [attr.aria-label]="'XP.ACTIONS.Close' | translate"
      >
        <z-icon zType="x" />
      </button>
    </header>
    <div xpDialogBody>
      @if (loading()) {
        <p role="status">{{ 'XP.Copilot.Management.LoadingRules' | translate }}</p>
      }
      @if (error()) {
        <p role="alert" class="text-destructive">{{ error() }}</p>
        <button z-button zType="outline" (click)="load()">{{ 'XP.ACTIONS.Retry' | translate }}</button>
      }
      @for (rule of rules(); track rule.name) {
        <div class="flex items-center justify-between gap-4 border-b border-border py-3">
          <label class="min-w-0"
            ><span>{{ rule.label | i18n }}</span>
            <p class="text-sm text-muted-foreground">{{ rule.help | i18n }}</p></label
          >
          <copilot-model-parameter-input
            [parameter]="rule"
            [ngModel]="options()[rule.name]"
            (ngModelChange)="setOption(rule.name, $event)"
          />
        </div>
      }
      @if (resolved().missing.length) {
        <p role="alert" class="text-destructive">
          {{ 'XP.Copilot.Management.MissingParameters' | translate }}: {{ resolved().missing.join(', ') }}
        </p>
      }
    </div>
    <footer xpDialogFooter>
      <button z-button zType="outline" (click)="dialog.close()">{{ 'XP.ACTIONS.Cancel' | translate }}</button
      ><button z-button [zDisabled]="loading() || !!error() || !!resolved().missing.length" (click)="apply()">
        {{ 'XP.ACTIONS.Save' | translate }}
      </button>
    </footer>
  </section>`
})
export class ModelParametersDialogComponent {
  readonly data = inject<{ model: ICopilotModel; providerId: string }>(DIALOG_DATA)
  readonly dialog = inject(DialogRef<ICopilotModel>)
  readonly service = inject(CopilotProviderService)
  readonly loading = signal(true)
  readonly error = signal('')
  readonly rules = signal<ParameterRule[]>([])
  readonly options = signal<Record<string, unknown>>({ ...this.data.model.options })
  readonly resolved = computed(() => transitionModelParameters(this.options(), this.rules(), 'compatible'))
  constructor() {
    void this.load()
  }
  async load() {
    this.loading.set(true)
    this.error.set('')
    try {
      this.rules.set(
        await firstValueFrom(
          this.service.getModelParameterRules(this.data.providerId, this.data.model.modelType, this.data.model.model)
        )
      )
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
  setOption(name: string, value: unknown) {
    this.options.update((options) => ({ ...options, [name]: value }))
  }
  apply() {
    if (this.loading() || this.error() || this.resolved().missing.length) return
    this.dialog.close({
      ...this.data.model,
      options: {
        ...this.resolved().options,
        ...(this.data.model.options?.context_size ? { context_size: this.data.model.options.context_size } : {})
      }
    })
  }
}
