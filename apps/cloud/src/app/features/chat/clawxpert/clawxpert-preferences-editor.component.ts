import { Component, computed, effect, inject, signal, untracked } from '@angular/core'
import { FormBuilder, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardCardImports,
  ZardIconComponent,
  ZardTabsImports
} from '@xpert-ai/headless-ui'
import { CodeEditorComponent } from '../../../@shared/editors/code-editor/editor.component'
import { ClawXpertFacade } from './clawxpert.facade'

type PreferenceTabKey = 'behavior' | 'userProfile'

type PreferenceTab = {
  key: PreferenceTabKey
  labelKey: string
  defaultLabel: string
  titleKey: string
  defaultTitle: string
  descKey: string
  defaultDesc: string
  fileName: string
}

const PREFERENCE_TABS: PreferenceTab[] = [
  {
    key: 'behavior',
    labelKey: 'PAC.Chat.ClawXpert.TabBehavior',
    defaultLabel: 'Behavior Guidelines',
    titleKey: 'PAC.Chat.ClawXpert.BehaviorEditorTitle',
    defaultTitle: 'SOUL.md',
    descKey: 'PAC.Chat.ClawXpert.BehaviorEditorDesc',
    defaultDesc: `The assistant's name, personality, and identity definition`,
    fileName: 'SOUL.md'
  },
  {
    key: 'userProfile',
    labelKey: 'PAC.Chat.ClawXpert.TabUserProfile',
    defaultLabel: 'User Profile',
    titleKey: 'PAC.Chat.ClawXpert.UserProfileEditorTitle',
    defaultTitle: 'USER.md',
    descKey: 'PAC.Chat.ClawXpert.UserProfileEditorDesc',
    defaultDesc: 'User preferences, communication style, and long-term memory',
    fileName: 'USER.md'
  }
]

@Component({
  standalone: true,
  selector: 'pac-clawxpert-preferences-editor',
  imports: [
    ReactiveFormsModule,
    TranslateModule,
    CodeEditorComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardCardImports,
    ...ZardTabsImports
  ],
  template: `
    <z-card class="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border shadow-none">
      <z-card-content class="flex min-h-0 flex-1 flex-col p-0">
        @if (isBlocked()) {
          <div class="flex min-h-[24rem] flex-1 flex-col items-center justify-center px-6 text-center">
            <z-icon zType="edit_note" class="text-3xl text-text-tertiary"></z-icon>
            <div class="mt-4 text-lg font-semibold text-text-primary">
              {{ blockedState().titleKey | translate: { Default: blockedState().defaultTitle } }}
            </div>
            <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              {{ blockedState().descKey | translate: { Default: blockedState().defaultDesc } }}
            </p>
          </div>
        } @else if (facade.loadingUserPreference()) {
          <div class="flex min-h-[24rem] flex-1 items-center justify-center px-6 text-sm text-text-secondary">
            {{ 'PAC.Chat.ClawXpert.LoadingPreference' | translate: { Default: 'Loading markdown documents…' } }}
          </div>
        } @else {
          <nav
            z-tab-nav-bar
            [tabPanel]="tabPanel"
            color="accent"
            alignTabs="start"
            stretchTabs="false"
            disableRipple
            displayDensity="cosy"
            class="border-b border-divider-regular px-5 pt-3"
          >
            @for (tab of tabs; track tab.key) {
              <button z-tab-link type="button" [active]="activeTab() === tab.key" (click)="selectTab(tab.key)">
                {{ tab.labelKey | translate: { Default: tab.defaultLabel } }}
              </button>
            }
          </nav>

          <z-tab-nav-panel #tabPanel class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div class="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5 pt-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                  <div class="shrink-0 text-lg font-semibold tracking-tight text-text-primary">
                    {{ activeTabMeta().titleKey | translate: { Default: activeTabMeta().defaultTitle } }}
                  </div>
                  <div class="hidden h-5 w-px bg-divider-regular sm:block"></div>
                  <p class="min-w-0 text-sm leading-6 text-text-secondary">
                    {{ activeTabMeta().descKey | translate: { Default: activeTabMeta().defaultDesc } }}
                  </p>
                </div>

                <span class="inline-flex items-center rounded-full border border-divider-regular bg-background-default-subtle px-3 py-1 text-xs text-text-secondary">
                  {{
                    'PAC.Chat.ClawXpert.WordCount'
                      | translate
                        : {
                            Default: '{count} words',
                            count: getActiveWordCount()
                          }
                  }}
                </span>
                <div class="flex flex-wrap items-center gap-2">
                  @if (editing()) {
                    <button
                      z-button
                      zType="outline"
                      type="button"
                      displayDensity="cosy"
                      [disabled]="facade.savingUserPreference()"
                      (click)="cancelEdit()"
                    >
                      {{ 'PAC.ACTIONS.Cancel' | translate: { Default: 'Cancel' } }}
                    </button>
                    <button
                      z-button
                      zType="default"

                      type="button"
                      displayDensity="cosy"
                      [disabled]="facade.savingUserPreference() || !form.dirty"
                      (click)="save()"
                    >
                      {{ 'PAC.KEY_WORDS.Save' | translate: { Default: 'Save' } }}
                    </button>
                  } @else {
                    <button
                      z-button
                      zType="outline"

                      type="button"
                      displayDensity="cosy"
                      [disabled]="facade.savingUserPreference()"
                      (click)="startEdit()"
                    >
                      <z-icon zType="edit"></z-icon>
                      {{ 'PAC.ACTIONS.Edit' | translate: { Default: 'Edit' } }}
                    </button>
                  }
                </div>
              </div>

              <div class="min-h-0 flex-1 overflow-hidden">
                @if (activeTab() === 'behavior') {
                  <pac-code-editor
                    class="block w-full"
                    [fileName]="activeTabMeta().fileName"
                    lineNumbers
                    [editable]="editing()"
                    wordWrap
                    [formControl]="form.controls.soul"
                  />
                } @else {
                  <pac-code-editor
                    class="block w-full"
                    [fileName]="activeTabMeta().fileName"
                    lineNumbers
                    [editable]="editing()"
                    wordWrap
                    [formControl]="form.controls.profile"
                  />
                }
              </div>
            </div>
          </z-tab-nav-panel>
        }
      </z-card-content>
    </z-card>
  `
})
export class ClawXpertPreferencesEditorComponent {
  readonly facade = inject(ClawXpertFacade)
  readonly #formBuilder = inject(FormBuilder)

  readonly tabs = PREFERENCE_TABS
  readonly activeTab = signal<PreferenceTabKey>('behavior')
  readonly editing = signal(false)
  readonly form = this.#formBuilder.nonNullable.group({
    soul: [''],
    profile: ['']
  })
  readonly activeTabMeta = computed(() => {
    return this.tabs.find((tab) => tab.key === this.activeTab()) ?? this.tabs[0]
  })
  readonly isBlocked = computed(() => this.facade.viewState() !== 'ready' || !this.facade.preference()?.id)
  readonly blockedState = computed(() => {
    if (!this.facade.organizationId()) {
      return {
        titleKey: 'PAC.Chat.ClawXpert.EditorOrganizationRequiredTitle',
        defaultTitle: 'Choose an organization first',
        descKey: 'PAC.Chat.ClawXpert.EditorOrganizationRequiredDesc',
        defaultDesc: 'Select an organization and finish the ClawXpert setup before editing SOUL.md and USER.md.'
      }
    }

    if (!this.facade.preference()?.id) {
      return {
        titleKey: 'PAC.Chat.ClawXpert.EditorBindingRequiredTitle',
        defaultTitle: 'Bind ClawXpert before editing',
        descKey: 'PAC.Chat.ClawXpert.EditorBindingRequiredDesc',
        defaultDesc: 'Once a ClawXpert binding is created, this editor will load SOUL.md and USER.md.'
      }
    }

    return {
      titleKey: 'PAC.Chat.ClawXpert.EditorUnavailableTitle',
      defaultTitle: 'Markdown editor is temporarily unavailable',
      descKey: 'PAC.Chat.ClawXpert.EditorUnavailableDesc',
      defaultDesc: 'The shell must be in the ready state before these thread-adjacent markdown documents can be edited.'
    }
  })

  constructor() {
    effect(() => {
      const bindingId = this.facade.preference()?.id
      const preference = this.facade.userPreference()

      untracked(() => {
        this.form.reset(
          {
            soul: bindingId ? preference?.soul ?? '' : '',
            profile: bindingId ? preference?.profile ?? '' : ''
          },
          { emitEvent: false }
        )
        this.editing.set(false)
      })
    })
  }

  selectTab(tab: PreferenceTabKey) {
    this.activeTab.set(tab)
  }

  startEdit() {
    this.editing.set(true)
  }

  cancelEdit() {
    const preference = this.facade.userPreference()
    this.form.reset(
      {
        soul: preference?.soul ?? '',
        profile: preference?.profile ?? ''
      },
      { emitEvent: false }
    )
    this.editing.set(false)
  }

  async save() {
    const preference = await this.facade.saveUserPreference(this.form.getRawValue())
    if (!preference) {
      return
    }

    this.form.reset(
      {
        soul: preference.soul ?? '',
        profile: preference.profile ?? ''
      },
      { emitEvent: false }
    )
    this.editing.set(false)
  }

  getActiveWordCount() {
    return this.activeTab() === 'behavior'
      ? countWords(this.form.controls.soul.value)
      : countWords(this.form.controls.profile.value)
  }

  getTotalWordCount() {
    return countWords(this.form.controls.soul.value) + countWords(this.form.controls.profile.value)
  }
}

function countWords(value?: string | null) {
  const content = value?.trim()
  if (!content) {
    return 0
  }

  return content.split(/\s+/).length
}
