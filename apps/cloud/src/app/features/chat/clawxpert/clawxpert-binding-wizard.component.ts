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
import { CLAWXPERT_TEMPLATE_ID } from './clawxpert-template.constants'

@Component({
  standalone: true,
  selector: 'xp-clawxpert-binding-wizard',
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
    <div class="h-full overflow-y-auto">
      <form class="flex min-h-full flex-col" [formGroup]="form">
        <header class="sticky top-0 z-10 shrink-0 bg-background px-8 pb-4 pt-8">
          <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
            {{ 'XP.Chat.ClawXpert.Wizard' | translate: { Default: 'Setup Wizard' } }}
          </div>
          <div class="mt-3 text-xl font-semibold text-text-primary">
            {{
              'XP.Chat.ClawXpert.WizardTitle'
                | translate: { Default: 'Choose the published Xpert to use as the agent for your ClawXpert.' }
            }}
          </div>
          <p class="mt-2 max-w-lg text-sm text-text-secondary">
            {{
              'XP.Chat.ClawXpert.WizardDesc'
                | translate: { Default: 'This page only needs one binding. You can change it later at any time.' }
            }}
          </p>

          @if (facade.availableXperts().length > 0) {
            <div class="mt-4 flex items-center gap-3">
              <button
                z-button
                zType="default"
                zSize="lg"
                type="button"
                [disabled]="creatingXpert()"
                (click)="openCreateWizard()"
              >
                {{ 'XP.Chat.ClawXpert.CreateNew' | translate: { Default: 'New ClawXpert' } }}
              </button>
              <label class="relative block min-w-0 flex-1">
                <span class="sr-only">
                  {{
                    'XP.Chat.ClawXpert.SearchPlaceholder'
                      | translate: { Default: 'Search your available assistants by title, name, slug, or id' }
                  }}
                </span>
                <z-icon
                  zType="search"
                  class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
                  aria-hidden="true"
                />
                <input
                  z-input
                  class="block h-9 pl-10 text-text-primary transition-colors"
                  [formControl]="searchControl"
                  [placeholder]="
                    'XP.Chat.ClawXpert.SearchPlaceholder'
                      | translate: { Default: 'Search your available assistants by title, name, slug, or id' }
                  "
                  type="text"
                />
              </label>
            </div>
          }

          @if (facade.orphanedPreference()) {
            <z-card class="mt-4 border border-divider-regular bg-components-card-bg shadow-none">
              <z-card-content class="px-4 py-3 text-sm text-text-secondary">
                {{
                  'XP.Chat.ClawXpert.BindingUnavailable'
                    | translate
                      : {
                          Default:
                            'Your previous ClawXpert binding is no longer available. Please select another assistant.'
                        }
                }}
              </z-card-content>
            </z-card>
          }
        </header>

        <div class="flex flex-1 flex-col px-8">
          @if (facade.availableXperts().length === 0) {
            <div class="mt-6 flex flex-1 flex-col items-center justify-center px-6 text-center">
              <z-icon zType="smart_toy" class="text-4xl text-text-tertiary"></z-icon>
              <div class="mt-4 text-base font-medium text-text-primary">
                {{
                  'XP.Chat.ClawXpert.NoAssistants' | translate: { Default: 'No published assistants are available yet' }
                }}
              </div>
              <div class="mt-2 max-w-sm text-sm text-text-secondary">
                {{
                  'XP.Chat.ClawXpert.NoAssistantsDesc'
                    | translate
                      : { Default: 'Create a new ClawXpert here, or publish an existing Xpert and bind it here later.' }
                }}
              </div>
              <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  z-button
                  zType="default"
                  zSize="lg"
                  type="button"
                  [disabled]="creatingXpert()"
                  (click)="openCreateWizard()"
                >
                  {{ 'XP.Chat.ClawXpert.CreateNew' | translate: { Default: 'New ClawXpert' } }}
                </button>
                <button z-button zType="outline" zSize="lg" type="button" routerLink="/xpert/w">
                  {{ 'XP.Chat.GotoWorkspace' | translate: { Default: 'Go to Workspace' } }}
                </button>
              </div>
            </div>
          } @else {
            <div class="flex-1">
              @if (filteredXperts().length > 0) {
                <div class="grid gap-x-4 lg:grid-cols-2">
                  @for (item of filteredXperts(); track item.id) {
                    <button
                      type="button"
                      class="h-full w-full border-b px-3 py-3 text-left text-text-primary transition-colors hover:bg-hover-bg focus-visible:bg-hover-bg"
                      [class]="
                        form.controls.assistantId.value === item.id
                          ? 'border-divider-deep bg-hover-bg'
                          : 'border-divider-regular bg-transparent'
                      "
                      [attr.aria-pressed]="form.controls.assistantId.value === item.id"
                      (click)="selectXpert(item.id)"
                    >
                      <div class="flex items-start gap-3">
                        <emoji-avatar
                          small
                          class="mt-0.5 shrink-0 overflow-hidden rounded-lg bg-background-default-subtle text-sm"
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
                    'XP.Chat.ClawXpert.NoMatches' | translate: { Default: 'No assistants match your current search.' }
                  }}
                </div>
              }
            </div>
          }
        </div>

        @if (facade.availableXperts().length > 0) {
          <footer
            class="sticky bottom-0 z-10 mt-auto flex shrink-0 flex-wrap items-center justify-end gap-2 bg-background px-8 pb-8 pt-4"
          >
            <button
              z-button
              zType="outline"
              zSize="lg"
              type="button"
              [disabled]="creatingXpert()"
              (click)="openCreateWizard()"
            >
              {{ 'XP.Chat.ClawXpert.CreateNew' | translate: { Default: 'New ClawXpert' } }}
            </button>
            @if (facade.resolvedPreference()) {
              <button z-button zType="outline" zSize="lg" type="button" (click)="cancelWizard()">
                {{ 'XP.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
              </button>
            }
            <button
              z-button
              zType="default"
              zSize="lg"
              type="button"
              [disabled]="form.invalid || facade.saving()"
              (click)="savePreference()"
            >
              {{ 'XP.KEY_WORDS.Save' | translate: { Default: 'Save' } }}
            </button>
          </footer>
        }
      </form>
    </div>
  `
})
export class ClawXpertBindingWizardComponent {
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
      this.#translate.instant('XP.Chat.ClawXpert.NoDescription', {
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
      initialStartMode: 'template',
      initialTemplateId: CLAWXPERT_TEMPLATE_ID,
      lockStartMode: true,
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
