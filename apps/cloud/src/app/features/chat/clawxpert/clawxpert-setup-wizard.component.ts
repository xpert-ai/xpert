import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardCardImports,
  ZardIconComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { startWith } from 'rxjs'
import { IXpert } from '../../../@core'
import { ClawXpertFacade } from './clawxpert.facade'

@Component({
  standalone: true,
  selector: 'pac-clawxpert-setup-wizard',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    TranslateModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardCardImports
  ],
  template: `
    <z-card class="flex h-full min-h-[32rem] flex-col overflow-hidden rounded-3xl border border-divider-regular shadow-sm">
      <z-card-content class="flex min-h-0 flex-1 flex-col p-5">
        <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
          {{ 'PAC.Chat.ClawXpert.Wizard' | translate: { Default: 'Setup Wizard' } }}
        </div>
        <div class="mt-3 text-xl font-semibold text-text-primary">
          {{
            'PAC.Chat.ClawXpert.WizardTitle'
              | translate
                : { Default: 'Choose the published Xpert that should power your ClawXpert page.' }
          }}
        </div>
        <p class="mt-2 max-w-lg text-sm text-text-secondary">
          {{
            'PAC.Chat.ClawXpert.WizardDesc'
              | translate
                : { Default: 'This page only needs one binding. You can change it later at any time.' }
          }}
        </p>

        @if (facade.orphanedPreference()) {
          <z-card class="mt-4 border border-divider-regular bg-components-card-bg shadow-none">
            <z-card-content class="px-4 py-3 text-sm text-text-secondary">
              {{
                'PAC.Chat.ClawXpert.BindingUnavailable'
                  | translate
                    : { Default: 'Your previous ClawXpert binding is no longer available. Please select another assistant.' }
              }}
            </z-card-content>
          </z-card>
        }

        @if (facade.availableXperts().length === 0) {
          <div class="mt-6 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-components-card-bg px-6 text-center">
            <z-icon zType="smart_toy" class="text-4xl text-text-tertiary"></z-icon>
            <div class="mt-4 text-base font-medium text-text-primary">
              {{
                'PAC.Chat.ClawXpert.NoAssistants'
                  | translate
                    : { Default: 'No published assistants are available yet' }
              }}
            </div>
            <div class="mt-2 max-w-sm text-sm text-text-secondary">
              {{
                'PAC.Chat.ClawXpert.NoAssistantsDesc'
                  | translate
                    : { Default: 'Publish an Xpert that you can access, then come back and bind it to ClawXpert.' }
              }}
            </div>
            <button z-button zType="outline" displayDensity="cosy" type="button" class="mt-4" routerLink="/xpert/w">
              {{ 'PAC.Chat.GotoWorkspace' | translate: { Default: 'Go to Workspace' } }}
            </button>
          </div>
        } @else {
          <form class="mt-5 flex min-h-0 flex-1 flex-col" [formGroup]="form">
            <label class="grid gap-2">
              <span class="text-sm text-text-secondary">
                {{
                  'PAC.Chat.ClawXpert.SearchPlaceholder'
                    | translate
                      : { Default: 'Search your available assistants by title, name, slug, or id' }
                }}
              </span>
              <input
                z-input
                class="block h-10 w-full rounded-2xl border border-transparent bg-components-input-bg-normal px-3 text-sm text-text-primary outline-none transition-colors hover:border-components-input-border-hover hover:bg-components-input-bg-hover focus:border-components-input-border-active focus:bg-components-input-bg-active"
                [formControl]="searchControl"
                type="text"
              />
            </label>

            <div class="mt-4 min-h-0 flex-1 overflow-auto rounded-2xl border border-divider-regular bg-components-card-bg p-2">
              @if (filteredXperts().length > 0) {
                <div class="space-y-2">
                  @for (item of filteredXperts(); track item.id) {
                    <button
                      type="button"
                      class="w-full rounded-2xl border px-4 py-3 text-left transition-colors"
                      [class.border-divider-deep]="form.controls.assistantId.value === item.id"
                      [class.border-divider-regular]="form.controls.assistantId.value !== item.id"
                      [class.bg-hover-bg]="form.controls.assistantId.value === item.id"
                      [class.bg-components-card-bg]="form.controls.assistantId.value !== item.id"
                      [class.shadow-sm]="form.controls.assistantId.value === item.id"
                      [class.text-text-primary]="true"
                      (click)="selectXpert(item.id)"
                    >
                      <div class="font-medium">{{ getXpertLabel(item) }}</div>
                      <div class="mt-1 font-mono text-xs text-text-secondary">{{ item.id }}</div>
                    </button>
                  }
                </div>
              } @else {
                <div class="flex h-full min-h-40 items-center justify-center px-4 text-center text-sm text-text-secondary">
                  {{
                    'PAC.Chat.ClawXpert.NoMatches'
                      | translate
                        : { Default: 'No assistants match your current search.' }
                  }}
                </div>
              }
            </div>

            <div class="mt-4 flex items-center justify-end gap-2">
              @if (facade.resolvedPreference()) {
                <button z-button zType="outline" displayDensity="cosy" type="button" (click)="cancelWizard()">
                  {{ 'PAC.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
                </button>
              }
              <button
                z-button
                zType="default"
                color="primary"
                displayDensity="cosy"
                type="button"
                [disabled]="form.invalid || facade.saving()"
                (click)="savePreference()"
              >
                {{ 'PAC.KEY_WORDS.Save' | translate: { Default: 'Save' } }}
              </button>
            </div>
          </form>
        }
      </z-card-content>
    </z-card>
  `
})
export class ClawXpertSetupWizardComponent {
  readonly facade = inject(ClawXpertFacade)
  readonly #formBuilder = inject(FormBuilder)

  readonly searchControl = this.#formBuilder.nonNullable.control('')
  readonly searchText = toSignal(this.searchControl.valueChanges.pipe(startWith(this.searchControl.value)), {
    initialValue: this.searchControl.value
  })
  readonly form = this.#formBuilder.nonNullable.group({
    assistantId: this.#formBuilder.nonNullable.control('', Validators.required)
  })
  readonly filteredXperts = computed(() => {
    const searchText = this.searchText().trim().toLowerCase()
    if (!searchText) {
      return this.facade.availableXperts()
    }

    return this.facade.availableXperts().filter((xpert) =>
      [xpert.id, xpert.slug, xpert.name, xpert.title, xpert.titleCN]
        .filter((value): value is string => !!value)
        .some((value) => value.toLowerCase().includes(searchText))
    )
  })

  constructor() {
    effect(() => {
      if (this.facade.organizationId()) {
        return
      }

      this.form.reset({ assistantId: '' }, { emitEvent: false })
      this.searchControl.setValue('', { emitEvent: false })
    })

    effect(() => {
      const assistantId = this.facade.resolvedPreference()?.assistantId ?? ''
      this.form.controls.assistantId.setValue(assistantId, { emitEvent: false })

      if (!assistantId) {
        this.searchControl.setValue('', { emitEvent: false })
      }
    })
  }

  cancelWizard() {
    this.facade.cancelWizard()
    this.form.controls.assistantId.setValue(this.facade.resolvedPreference()?.assistantId ?? '', { emitEvent: false })
  }

  selectXpert(id: string) {
    this.form.controls.assistantId.setValue(id)
    this.form.controls.assistantId.markAsTouched()
    this.form.controls.assistantId.markAsDirty()
  }

  async savePreference() {
    this.form.markAllAsTouched()
    if (this.form.invalid) {
      return
    }

    await this.facade.savePreference(this.form.getRawValue().assistantId)
    this.searchControl.setValue('', { emitEvent: false })
  }

  getXpertLabel(xpert: Partial<IXpert> | null | undefined) {
    return this.facade.getXpertLabel(xpert)
  }
}
