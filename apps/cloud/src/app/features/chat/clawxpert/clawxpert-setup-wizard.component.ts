import { CommonModule } from '@angular/common'
import { Dialog } from '@angular/cdk/dialog'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardButtonComponent, ZardCardImports, ZardIconComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { startWith } from 'rxjs'
import { IXpert, XpertTypeEnum } from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import {
  BLANK_XPERT_DIALOG_CATEGORY,
  BlankXpertDialogData,
  BlankXpertWizardResult,
  XpertNewBlankComponent
} from '../../xpert/xpert'
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
    EmojiAvatarComponent,
    ...ZardCardImports
  ],
  template: `
    <z-card
      class="flex h-full min-h-[32rem] flex-col overflow-hidden rounded-3xl border border-border shadow-none"
    >
      <z-card-content class="flex min-h-0 flex-1 flex-col p-5">
        <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
          {{ 'PAC.Chat.ClawXpert.Wizard' | translate: { Default: 'Setup Wizard' } }}
        </div>
        <div class="mt-3 text-xl font-semibold text-text-primary">
          {{
            'PAC.Chat.ClawXpert.WizardTitle'
              | translate: { Default: 'Choose the published Xpert to use as the agent for your ClawXpert.' }
          }}
        </div>
        <p class="mt-2 max-w-lg text-sm text-text-secondary">
          {{
            'PAC.Chat.ClawXpert.WizardDesc'
              | translate: { Default: 'This page only needs one binding. You can change it later at any time.' }
          }}
        </p>

        @if (facade.availableXperts().length > 0) {
          <div class="mt-4 flex flex-wrap items-center gap-2">
            <button
              z-button
              zType="default"

              displayDensity="cosy"
              type="button"
              [disabled]="creatingXpert()"
              (click)="openCreateWizard()"
            >
              {{ 'PAC.Chat.ClawXpert.CreateNew' | translate: { Default: 'New ClawXpert' } }}
            </button>
          </div>
        }

        @if (facade.orphanedPreference()) {
          <z-card class="mt-4 border border-divider-regular bg-components-card-bg shadow-none">
            <z-card-content class="px-4 py-3 text-sm text-text-secondary">
              {{
                'PAC.Chat.ClawXpert.BindingUnavailable'
                  | translate
                    : {
                        Default:
                          'Your previous ClawXpert binding is no longer available. Please select another assistant.'
                      }
              }}
            </z-card-content>
          </z-card>
        }

        @if (facade.availableXperts().length === 0) {
          <div
            class="mt-6 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular bg-components-card-bg px-6 text-center"
          >
            <z-icon zType="smart_toy" class="text-4xl text-text-tertiary"></z-icon>
            <div class="mt-4 text-base font-medium text-text-primary">
              {{
                'PAC.Chat.ClawXpert.NoAssistants' | translate: { Default: 'No published assistants are available yet' }
              }}
            </div>
            <div class="mt-2 max-w-sm text-sm text-text-secondary">
              {{
                'PAC.Chat.ClawXpert.NoAssistantsDesc'
                  | translate
                    : { Default: 'Create a new ClawXpert here, or publish an existing Xpert and bind it here later.' }
              }}
            </div>
            <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                z-button
                zType="default"

                displayDensity="cosy"
                type="button"
                [disabled]="creatingXpert()"
                (click)="openCreateWizard()"
              >
                {{ 'PAC.Chat.ClawXpert.CreateNew' | translate: { Default: 'New ClawXpert' } }}
              </button>
              <button z-button zType="outline" displayDensity="cosy" type="button" routerLink="/xpert/w">
                {{ 'PAC.Chat.GotoWorkspace' | translate: { Default: 'Go to Workspace' } }}
              </button>
            </div>
          </div>
        } @else {
          <form class="mt-5 flex min-h-0 flex-1 flex-col" [formGroup]="form">
            <label class="grid gap-2">
              <span class="text-sm text-text-secondary">
                {{
                  'PAC.Chat.ClawXpert.SearchPlaceholder'
                    | translate: { Default: 'Search your available assistants by title, name, slug, or id' }
                }}
              </span>
              <input
                z-input
                class="block h-10 w-full rounded-2xl border border-transparent bg-components-input-bg-normal px-3 text-sm text-text-primary outline-none transition-colors hover:border-components-input-border-hover hover:bg-components-input-bg-hover focus:border-components-input-border-active focus:bg-components-input-bg-active"
                [formControl]="searchControl"
                type="text"
              />
            </label>

            <div
              class="mt-4 min-h-0 flex-1 overflow-auto rounded-2xl border border-divider-regular bg-components-card-bg p-2"
            >
              @if (filteredXperts().length > 0) {
                <div class="grid gap-2 lg:grid-cols-2">
                  @for (item of filteredXperts(); track item.id) {
                    <button
                      type="button"
                      class="h-full w-full rounded-2xl border px-4 py-3 text-left transition-colors"
                      [class.border-divider-deep]="form.controls.assistantId.value === item.id"
                      [class.border-divider-regular]="form.controls.assistantId.value !== item.id"
                      [class.bg-hover-bg]="form.controls.assistantId.value === item.id"
                      [class.bg-components-card-bg]="form.controls.assistantId.value !== item.id"
                      [class.shadow-sm]="form.controls.assistantId.value === item.id"
                      [class.text-text-primary]="true"
                      (click)="selectXpert(item.id)"
                    >
                      <div class="flex items-start gap-3">
                        <emoji-avatar
                          class="mt-0.5 shrink-0 overflow-hidden rounded-2xl border border-divider-regular bg-background-default-subtle shadow-sm"
                          [style.width.px]="48"
                          [style.height.px]="48"
                          [avatar]="item.avatar ?? null"
                          [alt]="getXpertLabel(item)"
                          [fallbackLabel]="getXpertLabel(item)"
                        />

                        <div class="min-w-0 flex-1">
                          <div class="truncate font-medium">{{ getXpertLabel(item) }}</div>
                          <div class="mt-1 line-clamp-2 text-sm leading-5 text-text-secondary">
                            {{ getXpertDescription(item) }}
                          </div>
                        </div>
                      </div>
                    </button>
                  }
                </div>
              } @else {
                <div
                  class="flex h-full min-h-40 items-center justify-center px-4 text-center text-sm text-text-secondary"
                >
                  {{
                    'PAC.Chat.ClawXpert.NoMatches' | translate: { Default: 'No assistants match your current search.' }
                  }}
                </div>
              }
            </div>

            <div class="mt-4 flex items-center justify-end gap-2">
              <button
                z-button
                zType="outline"
                displayDensity="cosy"
                type="button"
                [disabled]="creatingXpert()"
                (click)="openCreateWizard()"
              >
                {{ 'PAC.Chat.ClawXpert.CreateNew' | translate: { Default: 'New ClawXpert' } }}
              </button>
              @if (facade.resolvedPreference()) {
                <button z-button zType="outline" displayDensity="cosy" type="button" (click)="cancelWizard()">
                  {{ 'PAC.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
                </button>
              }
              <button
                z-button
                zType="default"

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
  readonly #dialog = inject(Dialog)
  readonly #formBuilder = inject(FormBuilder)
  readonly #translate = inject(TranslateService)
  readonly creatingXpert = signal(false)

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

    return this.facade
      .availableXperts()
      .filter((xpert) =>
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

  getXpertDescription(xpert: Partial<IXpert> | null | undefined) {
    return (
      xpert?.description ||
      this.#translate.instant('PAC.Chat.ClawXpert.NoDescription', {
        Default: 'This assistant does not have a public description yet.'
      })
    )
  }

  openCreateWizard() {
    if (this.creatingXpert()) {
      return
    }

    const dialogData = {
      allowWorkspaceSelection: true,
      allowedModes: [XpertTypeEnum.Agent],
      category: BLANK_XPERT_DIALOG_CATEGORY.CLAW,
      completionMode: 'publish',
      type: XpertTypeEnum.Agent
    } satisfies BlankXpertDialogData

    this.creatingXpert.set(true)
    this.#dialog
      .open<BlankXpertWizardResult>(XpertNewBlankComponent, {
        disableClose: true,
        data: dialogData
      })
      .closed.subscribe(async (result) => {
        try {
          if (result?.status === 'published' && result.xpert?.id) {
            await this.facade.bindPublishedXpert(result.xpert)
            this.searchControl.setValue('', { emitEvent: false })
          }
        } finally {
          this.creatingXpert.set(false)
        }
      })
  }
}
