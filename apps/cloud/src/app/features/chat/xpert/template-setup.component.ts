import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, inject, signal } from '@angular/core'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { XpDialogFrameImports, ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import type { AssistantTemplateSetup, TemplateSetupUpdate } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage } from '../../../@core'
import { AssistantTemplateSetupService } from '../../../@core/services/assistant-template-setup.service'

@Component({
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardInputDirective
  ],
  template: ` <div xpDialogLayout="wide" class="w-[min(44rem,95vw)] max-h-[84dvh]">
    <header xpDialogHeader>
      <h2 xpDialogHeading>{{ 'TemplateSetup.Title' | translate }}</h2>
      <button
        xpDialogCloseButton
        type="button"
        (click)="dialog.close()"
        [attr.aria-label]="'TemplateSetup.Close' | translate"
      >
        ×
      </button>
    </header>
    <div xpDialogBody class="space-y-5">
      @if (error()) {
        <p role="alert" class="text-text-destructive">{{ error() }}</p>
      }
      @if (setup(); as value) {
        @if (value.onboarding; as onboarding) {
          <h3 class="font-medium">
            {{ (value.state.completedAt ? 'TemplateSetup.Completed' : 'TemplateSetup.GetStarted') | translate }}
          </h3>
          <p class="text-text-secondary">{{ onboarding.completionCriteria }}</p>
          <form [formGroup]="form" class="space-y-3" (ngSubmit)="save()">
            @for (key of onboarding.preferences; track key) {
              <label class="block">{{ key }}<input z-input class="mt-1 w-full" [formControlName]="key" /></label>
            }
            <button z-button type="submit" [zDisabled]="busy()">
              {{ 'TemplateSetup.SavePreferences' | translate }}
            </button>
          </form>
          @if (value.state.firstResult) {
            <p class="whitespace-pre-wrap text-text-secondary">{{ value.state.firstResult }}</p>
          }
          @if (!value.state.completedAt) {
            <p class="text-text-secondary">{{ 'TemplateSetup.StartInChat' | translate }}</p>
          }
        }
        @if (value.connectors.length) {
          <h3 class="font-medium">{{ 'TemplateSetup.Connectors' | translate }}</h3>
          @for (connector of value.connectors; track connector.key) {
            <section class="border-b border-divider-regular py-3">
              <p>
                {{ connector.purpose }} ·
                {{ (connector.required ? 'TemplateSetup.Required' : 'TemplateSetup.Optional') | translate }}
              </p>
              <p class="text-text-secondary">{{ 'TemplateSetup.Status.' + connector.status | translate }}</p>
              <label
                >{{ 'TemplateSetup.Account' | translate }}
                <select
                  class="xp-input w-full"
                  [disabled]="busy()"
                  [value]="selected(connector.key)"
                  (change)="choose(connector.key, $event)"
                >
                  <option value="">{{ 'TemplateSetup.Select' | translate }}</option>
                  @for (option of connector.options; track option.bindingId) {
                    <option [value]="option.bindingId" [selected]="selected(connector.key) === option.bindingId">
                      {{ option.label }}
                    </option>
                  }
                </select>
              </label>
              @if (!connector.required) {
                <button
                  z-button
                  zType="ghost"
                  type="button"
                  [zDisabled]="busy()"
                  (click)="update({ connector: { key: connector.key, selection: { choice: 'skip' } } })"
                >
                  {{ 'TemplateSetup.Skip' | translate }}
                </button>
              }
            </section>
          }
          @if (value.managementUrl) {
            <a [routerLink]="value.managementUrl" (click)="dialog.close()" class="text-primary underline">{{
              'TemplateSetup.ManageConnections' | translate
            }}</a>
          }
        }
        @if (value.routines.length) {
          <h3 class="font-medium">{{ 'TemplateSetup.Routines' | translate }}</h3>
          @for (routine of value.routines; track routine.key) {
            <section class="space-y-2 border-b border-divider-regular py-3">
              <p>
                {{ routine.key }} ·
                {{ (routine.enabled ? 'TemplateSetup.Enabled' : 'TemplateSetup.Paused') | translate }}
              </p>
              <p class="text-text-secondary">{{ routine.output }}</p>
              @if (!routine.supported) {
                <p role="status">{{ 'TemplateSetup.UnsupportedRoutine' | translate }}</p>
              }
              <label class="block"
                >{{ 'TemplateSetup.Schedule' | translate
                }}<input z-input class="w-full" #expression [value]="routine.expression"
              /></label>
              <label class="block"
                >{{ 'TemplateSetup.TimeZone' | translate
                }}<input z-input class="w-full" #zone [value]="routine.timeZone || timeZone"
              /></label>
              @if (routine.nextRunAt) {
                <p>{{ 'TemplateSetup.NextRun' | translate }}: {{ routine.nextRunAt }}</p>
              }
              <button
                z-button
                type="button"
                [zDisabled]="busy() || !routine.supported"
                (click)="routineUpdate(routine.key, !routine.enabled, expression.value, zone.value)"
              >
                {{ (routine.enabled ? 'TemplateSetup.Pause' : 'TemplateSetup.Enable') | translate }}
              </button>
              <button
                z-button
                zType="outline"
                type="button"
                [zDisabled]="busy() || !routine.supported"
                (click)="routineUpdate(routine.key, routine.enabled, expression.value, zone.value)"
              >
                {{ 'TemplateSetup.SaveSchedule' | translate }}
              </button>
            </section>
          }
        }
      } @else {
        <p role="status">{{ 'TemplateSetup.Loading' | translate }}</p>
      }
    </div>
    <footer xpDialogFooter>
      <button z-button zType="outline" type="button" [zDisabled]="busy()" (click)="reload()">
        {{ 'TemplateSetup.Refresh' | translate }}
      </button>
    </footer>
  </div>`
})
export class TemplateSetupComponent {
  readonly dialog = inject(DialogRef)
  readonly id = inject<string>(DIALOG_DATA)
  readonly api = inject(AssistantTemplateSetupService)
  readonly setup = signal<AssistantTemplateSetup | null>(null)
  readonly busy = signal(false)
  readonly error = signal('')
  readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  form = new FormGroup<Record<string, FormControl<string>>>({})
  constructor() {
    void this.reload()
  }
  async reload() {
    await this.perform(async () => this.accept(await firstValueFrom(this.api.get(this.id))))
  }
  private accept(value: AssistantTemplateSetup) {
    this.setup.set(value)
    this.form = new FormGroup(
      Object.fromEntries(
        (value.onboarding?.preferences ?? []).map((key) => [
          key,
          new FormControl(value.state.preferences[key] ?? '', { nonNullable: true })
        ])
      )
    )
  }
  async update(input: Omit<TemplateSetupUpdate, 'revision'>) {
    await this.perform(async () =>
      this.accept(await firstValueFrom(this.api.update(this.id, { ...input, revision: this.setup().state.revision })))
    )
  }
  save() {
    return this.update({ preferences: this.form.getRawValue() })
  }
  selected(key: string) {
    const choice = this.setup()?.state.connectors[key]
    return choice?.choice === 'binding' ? choice.bindingId : ''
  }
  choose(key: string, event: Event) {
    const input = event.target
    if (input instanceof HTMLSelectElement && input.value)
      void this.update({ connector: { key, selection: { choice: 'binding', bindingId: input.value } } })
  }
  async routineUpdate(key: string, enabled: boolean, expression: string, timeZone: string) {
    await this.perform(async () => {
      await firstValueFrom(this.api.routine(this.id, key, { enabled, expression, timeZone }))
      this.accept(await firstValueFrom(this.api.get(this.id)))
    })
  }
  private async perform(action: () => Promise<void>) {
    this.busy.set(true)
    this.error.set('')
    try {
      await action()
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
}
