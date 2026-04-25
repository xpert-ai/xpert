import { CommonModule } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardCardImports,
  ZardDialogService,
  ZardIconComponent,
  ZardSwitchComponent,
  ZardTabsImports
} from '@xpert-ai/headless-ui'
import { forkJoin, of } from 'rxjs'
import { catchError, map, startWith, switchMap, take } from 'rxjs/operators'
import {
  getEnabledTools,
  getErrorMessage,
  getToolLabel,
  I18nObject,
  ISkillPackage,
  ISkillRepositoryIndex,
  isMiddlewareToolEnabled,
  IWFNMiddleware,
  SkillPackageService,
  ToastrService,
  TAgentMiddlewareMeta,
  TXpertTeamDraft,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentService,
  XpertToolsetService
} from '../../../@core'
import { XpertSkillInstallDialogComponent, XpertSkillInstallDialogResult } from '../../../@shared/skills'
import {
  ClawXpertFacade,
  ClawXpertToolPreferenceSourceMetadata,
  ClawXpertToolPreferenceSourceType
} from './clawxpert.facade'

type ToolPreferenceTab = 'skills' | 'tools'

type ToolPreferenceItem = {
  id: string
  sourceType: ClawXpertToolPreferenceSourceType
  nodeKey: string
  toolName: string
  label: string | I18nObject
  description?: string | null
  sourceLabel: string | I18nObject
  metadata: ClawXpertToolPreferenceSourceMetadata
}

type SkillPreferenceItem = {
  id: string
  packageId: string
  workspaceId: string
  skillId: string
  label: string | I18nObject
  summary?: string | I18nObject | null
  repositoryName?: string | null
  provider?: string | null
}

type ToolPreferenceSourceError = {
  id: string
  sourceLabel: string | I18nObject
  message: string
}

type ToolPreferenceState = {
  loading: boolean
  tools: ToolPreferenceItem[]
  errors: ToolPreferenceSourceError[]
}

type SkillPreferenceState = {
  loading: boolean
  skills: SkillPreferenceItem[]
  errorMessage: string | null
}

const EMPTY_TOOL_PREFERENCE_STATE: ToolPreferenceState = {
  loading: false,
  tools: [],
  errors: []
}

const EMPTY_SKILL_PREFERENCE_STATE: SkillPreferenceState = {
  loading: false,
  skills: [],
  errorMessage: null
}

@Component({
  standalone: true,
  selector: 'pac-clawxpert-tool-preferences',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    NgmI18nPipe,
    ZardButtonComponent,
    ZardIconComponent,
    ZardSwitchComponent,
    ...ZardCardImports,
    ...ZardTabsImports
  ],
  template: `
    <z-card class="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border shadow-none">
      <z-card-content class="flex min-h-0 flex-1 flex-col p-0">
        @if (isBlocked()) {
          <div class="flex min-h-[20rem] flex-1 flex-col items-center justify-center px-6 text-center">
            <z-icon zType="toggle_on" class="text-3xl text-text-tertiary"></z-icon>
            <div class="mt-4 text-lg font-semibold text-text-primary">
              {{ blockedState().titleKey | translate: { Default: blockedState().defaultTitle } }}
            </div>
            <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              {{ blockedState().descKey | translate: { Default: blockedState().defaultDesc } }}
            </p>
          </div>
        } @else if (facade.loadingTriggerDraft()) {
          <div class="flex min-h-[20rem] flex-1 items-center justify-center px-6 text-sm text-text-secondary">
            {{ 'PAC.Chat.ClawXpert.LoadingToolPreferences' | translate: { Default: 'Loading tool preferences…' } }}
          </div>
        } @else if (facade.triggerDraftErrorMessage()) {
          <div class="flex min-h-[20rem] flex-1 flex-col items-center justify-center px-6 text-center">
            <z-icon zType="warning" class="text-3xl text-text-tertiary"></z-icon>
            <div class="mt-4 text-lg font-semibold text-text-primary">
              {{
                'PAC.Chat.ClawXpert.ToolPreferencesLoadFailed'
                  | translate: { Default: 'Failed to load skills and tools.' }
              }}
            </div>
            <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              {{ facade.triggerDraftErrorMessage() }}
            </p>
          </div>
        } @else {
          <nav
            z-tab-nav-bar
            [tabPanel]="tabPanel"
            color="accent"
            alignTabs="start"
            stretchTabs="false"
            disableRipple
            zSize="default"
            class="border-b border-divider-regular px-5 pt-3"
          >
            <button z-tab-link type="button" [active]="activeTab() === 'skills'" (click)="selectTab('skills')">
              {{ 'PAC.Workflow.Skill' | translate: { Default: 'Skill' } }}
            </button>
            <button z-tab-link type="button" [active]="activeTab() === 'tools'" (click)="selectTab('tools')">
              {{ 'PAC.Common.Tools' | translate: { Default: 'Tools' } }}
            </button>
          </nav>

          <z-tab-nav-panel #tabPanel class="flex min-h-0 flex-1 flex-col overflow-hidden">
            @if (activeTab() === 'skills') {
              <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div class="border-b border-divider-regular px-5 py-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="text-sm font-medium text-text-primary">
                        {{ 'PAC.Chat.ClawXpert.SkillPreferencesTitle' | translate: { Default: 'Skill preferences' } }}
                      </div>
                      <p class="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                        {{
                          'PAC.Chat.ClawXpert.SkillPreferencesDesc'
                            | translate
                              : {
                                  Default:
                                    'Choose which installed workspace skills stay available to this ClawXpert. Preferences are saved per user and used by runtime skill filtering.'
                                }
                        }}
                      </p>
                    </div>

                    <span
                      class="inline-flex items-center rounded-full border border-divider-regular bg-background-default-subtle px-3 py-1 text-xs text-text-secondary"
                    >
                      {{
                        'PAC.Chat.ClawXpert.SkillCount'
                          | translate
                            : {
                                Default: '{count} skills',
                                count: skillItems().length
                              }
                      }}
                    </span>
                  </div>
                </div>

                <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
                  @if (!skillWorkspaceId()) {
                    <div
                      class="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular px-6 text-center"
                    >
                      <z-icon zType="work_history" class="text-3xl text-text-tertiary"></z-icon>
                      <div class="mt-4 text-lg font-semibold text-text-primary">
                        {{
                          'PAC.Chat.ClawXpert.WorkspaceRequiredForSkillsTitle'
                            | translate: { Default: 'This ClawXpert is not attached to a workspace yet' }
                        }}
                      </div>
                      <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                        {{
                          'PAC.Chat.ClawXpert.WorkspaceRequiredForSkillsDesc'
                            | translate
                              : {
                                  Default:
                                    'Bind or publish a workspace-backed xpert first, then this tab will load installed skills from that workspace.'
                                }
                        }}
                      </p>
                    </div>
                  } @else {
                    @if (skillState().loading) {
                      <div
                        class="flex min-h-[16rem] items-center justify-center rounded-2xl border border-dashed border-divider-regular px-6 text-sm text-text-secondary"
                      >
                        {{
                          'PAC.Chat.ClawXpert.LoadingWorkspaceSkills'
                            | translate: { Default: 'Loading workspace skills…' }
                        }}
                      </div>
                    } @else {
                      @if (skillState().errorMessage) {
                        <div class="rounded-2xl border border-divider-regular bg-background-default px-4 py-4">
                          <div class="flex items-start gap-3">
                            <z-icon zType="warning" class="mt-0.5 text-lg text-text-tertiary"></z-icon>
                            <div class="min-w-0">
                              <div class="text-sm font-semibold text-text-primary">
                                {{
                                  'PAC.Chat.ClawXpert.WorkspaceSkillsLoadFailed'
                                    | translate: { Default: 'Failed to load workspace skills' }
                                }}
                              </div>
                              <div class="mt-1 text-sm leading-6 text-text-secondary">
                                {{ skillState().errorMessage }}
                              </div>
                            </div>
                          </div>
                        </div>
                      } @else if (!skillItems().length) {
                        <div
                          class="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular px-6 text-center"
                        >
                          <z-icon zType="work_history" class="text-3xl text-text-tertiary"></z-icon>
                          <div class="mt-4 text-lg font-semibold text-text-primary">
                            {{
                              'PAC.Chat.ClawXpert.NoSkillsAvailableTitle'
                                | translate: { Default: 'No workspace skills installed yet' }
                            }}
                          </div>
                          <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                            {{
                              'PAC.Chat.ClawXpert.NoSkillsAvailableDesc'
                                | translate
                                  : {
                                      Default:
                                        'Open the install dialog and add a skill to this workspace to make it available here immediately.'
                                    }
                            }}
                          </p>
                        </div>
                      } @else {
                        <div class="grid gap-3 md:grid-cols-2">
                          @for (item of skillItems(); track item.id) {
                            <div
                              class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-4"
                            >
                              <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0 flex-1">
                                  <div class="truncate text-base font-semibold text-text-primary">
                                    {{ item.label | i18n }}
                                  </div>
                                  <div class="mt-1 line-clamp-2 text-sm leading-6 text-text-secondary">
                                    {{
                                      (item.summary | i18n) ||
                                        ('PAC.Chat.ClawXpert.SkillSummaryFallback'
                                          | translate
                                            : {
                                                Default:
                                                  'This skill is installed in the current workspace and can be enabled for ClawXpert runtime use.'
                                              })
                                    }}
                                  </div>
                                </div>

                                <z-switch
                                  zSize="sm"
                                  [ngModel]="facade.isSkillEnabled(item.workspaceId, item.packageId)"
                                  [disabled]="busy()"
                                  (ngModelChange)="toggleSkill(item, $event)"
                                />
                              </div>

                              <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
                                <div class="flex flex-wrap items-center gap-2">
                                  @if (item.repositoryName) {
                                    <span
                                      class="inline-flex items-center rounded-full border border-divider-regular bg-background-default px-3 py-1 text-xs text-text-secondary"
                                    >
                                      {{ item.repositoryName }}
                                    </span>
                                  }
                                  @if (item.provider) {
                                    <span
                                      class="inline-flex items-center rounded-full border border-divider-regular bg-background-default px-3 py-1 text-xs text-text-secondary"
                                    >
                                      {{ item.provider }}
                                    </span>
                                  }
                                </div>

                                @if (isSaving(item.id)) {
                                  <span class="text-xs text-text-tertiary">
                                    {{ 'PAC.Common.Saving' | translate: { Default: 'Saving…' } }}
                                  </span>
                                }
                              </div>
                            </div>
                          }
                        </div>
                      }

                      <div class="mt-6 rounded-2xl border border-divider-regular bg-background-default p-4">
                        <div class="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div class="text-sm font-medium text-text-primary">
                              {{
                                'PAC.Chat.ClawXpert.InstallWorkspaceSkillsTitle'
                                  | translate: { Default: 'Install skills into this workspace' }
                              }}
                            </div>
                            <p class="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                              {{
                                'PAC.Chat.ClawXpert.InstallWorkspaceSkillsDesc'
                                  | translate
                                    : {
                                        Default:
                                          'Open the install dialog to browse repositories and add skills to the bound workspace. New skills appear above with the switch enabled by default.'
                                      }
                              }}
                            </p>
                          </div>

                          @if (installingSkillPackage()) {
                            <span
                              class="inline-flex items-center rounded-full border border-divider-regular bg-background-default-subtle px-3 py-1 text-xs text-text-secondary"
                            >
                              {{ 'PAC.Chat.ClawXpert.InstallingSkill' | translate: { Default: 'Installing…' } }}
                            </span>
                          }
                          <button
                            z-button
                            zType="default"

                            type="button"
                            [disabled]="busy() || !skillWorkspaceId()"
                            (click)="openSkillInstallDialog()"
                          >
                            {{
                              'PAC.Chat.ClawXpert.BrowseWorkspaceSkills'
                                | translate: { Default: 'Browse & install skills' }
                            }}
                          </button>
                        </div>
                      </div>
                    }
                  }
                </div>
              </div>
            } @else {
              <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div class="border-b border-divider-regular px-5 py-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="text-sm font-medium text-text-primary">
                        {{ 'PAC.Chat.ClawXpert.ToolPreferencesTitle' | translate: { Default: 'Tool preferences' } }}
                      </div>
                      <p class="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                        {{
                          'PAC.Chat.ClawXpert.ToolPreferencesDesc'
                            | translate
                              : {
                                  Default:
                                    'Turn individual tools on or off for this ClawXpert binding. These preferences are saved per user and can be wired into runtime filtering later.'
                                }
                        }}
                      </p>
                    </div>

                    <span
                      class="inline-flex items-center rounded-full border border-divider-regular bg-background-default-subtle px-3 py-1 text-xs text-text-secondary"
                    >
                      {{
                        'PAC.Chat.ClawXpert.ToolCount'
                          | translate
                            : {
                                Default: '{count} tools',
                                count: toolItems().length
                              }
                      }}
                    </span>
                  </div>
                </div>

                <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
                  @if (toolState().loading) {
                    <div
                      class="flex min-h-[16rem] items-center justify-center rounded-2xl border border-dashed border-divider-regular px-6 text-sm text-text-secondary"
                    >
                      {{
                        'PAC.Chat.ClawXpert.LoadingToolPreferences'
                          | translate: { Default: 'Loading tool preferences…' }
                      }}
                    </div>
                  } @else if (!toolItems().length && !toolErrors().length) {
                    <div
                      class="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular px-6 text-center"
                    >
                      <z-icon zType="build" class="text-3xl text-text-tertiary"></z-icon>
                      <div class="mt-4 text-lg font-semibold text-text-primary">
                        {{
                          'PAC.Chat.ClawXpert.NoToolsAvailableTitle' | translate: { Default: 'No tools available yet' }
                        }}
                      </div>
                      <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                        {{
                          'PAC.Chat.ClawXpert.NoToolsAvailableDesc'
                            | translate
                              : {
                                  Default:
                                    'The bound xpert draft does not currently expose any enabled toolset or middleware tools.'
                                }
                        }}
                      </p>
                    </div>
                  } @else {
                    <div class="grid gap-3 md:grid-cols-2">
                      @for (item of toolItems(); track item.id) {
                        <div class="rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-4">
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0 flex-1">
                              <div class="truncate text-base font-semibold text-text-primary">
                                {{ item.label | i18n }}
                              </div>
                              <div class="mt-1 line-clamp-2 text-sm leading-6 text-text-secondary">
                                {{
                                  item.description ||
                                    (item.sourceType === 'toolset'
                                      ? ('PAC.Chat.ClawXpert.ToolsetToolFallbackDesc'
                                        | translate
                                          : {
                                              Default: 'Built-in tool available from this connected toolset.'
                                            })
                                      : ('PAC.Chat.ClawXpert.MiddlewareToolFallbackDesc'
                                        | translate
                                          : {
                                              Default: 'Runtime middleware tool available from this draft node.'
                                            }))
                                }}
                              </div>
                            </div>

                            <z-switch
                              zSize="sm"
                              [ngModel]="facade.isToolEnabled(item.sourceType, item.nodeKey, item.toolName)"
                              [disabled]="busy()"
                              (ngModelChange)="toggleTool(item, $event)"
                            />
                          </div>

                          <div class="mt-4 flex flex-wrap items-center justify-between gap-2">
                            <span
                              class="inline-flex items-center rounded-full border border-divider-regular bg-background-default px-3 py-1 text-xs text-text-secondary"
                            >
                              {{ item.sourceLabel | i18n }}
                            </span>

                            @if (isSaving(item.id)) {
                              <span class="text-xs text-text-tertiary">
                                {{ 'PAC.Common.Saving' | translate: { Default: 'Saving…' } }}
                              </span>
                            }
                          </div>
                        </div>
                      }

                      @for (error of toolErrors(); track error.id) {
                        <div
                          class="rounded-2xl border border-divider-regular bg-background-default px-4 py-4 md:col-span-2"
                        >
                          <div class="flex items-start gap-3">
                            <z-icon zType="warning" class="mt-0.5 text-lg text-text-tertiary"></z-icon>
                            <div class="min-w-0">
                              <div class="text-sm font-semibold text-text-primary">
                                {{ error.sourceLabel | i18n }}
                              </div>
                              <div class="mt-1 text-sm leading-6 text-text-secondary">
                                {{ error.message }}
                              </div>
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  }
                </div>
              </div>
            }
          </z-tab-nav-panel>
        }
      </z-card-content>
    </z-card>
  `
})
export class ClawXpertToolPreferencesComponent {
  readonly facade = inject(ClawXpertFacade)
  readonly #dialog = inject(ZardDialogService)
  readonly #toolsetService = inject(XpertToolsetService)
  readonly #xpertAgentService = inject(XpertAgentService)
  readonly #skillPackageService = inject(SkillPackageService)
  readonly #toastr = inject(ToastrService)

  readonly activeTab = signal<ToolPreferenceTab>('skills')
  readonly pendingPreferenceItems = signal<Record<string, boolean>>({})
  readonly installingSkillPackage = signal(false)
  readonly skillRefreshTick = signal(0)
  readonly middlewareProviders = toSignal(this.#xpertAgentService.agentMiddlewares$, {
    initialValue: [] as { meta: TAgentMiddlewareMeta }[]
  })
  readonly toolState = toSignal(
    toObservable(
      computed(() => ({
        draft: this.facade.triggerDraft(),
        middlewareProviders: this.middlewareProviders(),
        ready: this.facade.viewState() === 'ready' && !!this.facade.xpertId()
      }))
    ).pipe(
      switchMap(({ draft, middlewareProviders, ready }) => {
        if (!ready || !draft) {
          return of(EMPTY_TOOL_PREFERENCE_STATE)
        }

        const middlewareMetaMap = new Map(middlewareProviders.map((item) => [item.meta.name, item.meta]))
        const requests = [
          ...collectToolsetNodes(draft).map((node) =>
            this.#toolsetService.getOneById(node.entity.id, { relations: ['tools'] }).pipe(
              take(1),
              map((toolset) => buildToolsetPreferenceState(node, toolset)),
              catchError((error) =>
                of(
                  buildSourceErrorState(
                    node.key,
                    node.entity.name || node.entity.id,
                    getErrorMessage(error) || 'Failed to load toolset tools.'
                  )
                )
              )
            )
          ),
          ...collectMiddlewareNodes(draft).map((node) => {
            const middleware = node.entity as IWFNMiddleware
            const meta = middlewareMetaMap.get(middleware.provider)
            return this.#xpertAgentService
              .getAgentMiddleware(middleware.provider, middleware.options ?? {}, this.facade.xpertId())
              .pipe(
              take(1),
              map((response) => buildMiddlewarePreferenceState(node.key, middleware, meta, response.tools ?? [])),
              catchError((error) =>
                of(
                  buildSourceErrorState(
                    node.key,
                    meta?.label ?? middleware.provider,
                    getErrorMessage(error) || 'Failed to load middleware tools.'
                  )
                )
              )
            )
          })
        ]

        if (!requests.length) {
          return of(EMPTY_TOOL_PREFERENCE_STATE)
        }

        return forkJoin(requests).pipe(
          map((items) => ({
            loading: false,
            tools: items.flatMap((item) => item.tools),
            errors: items.flatMap((item) => item.errors)
          })),
          startWith({
            ...EMPTY_TOOL_PREFERENCE_STATE,
            loading: true
          })
        )
      })
    ),
    { initialValue: EMPTY_TOOL_PREFERENCE_STATE }
  )
  readonly skillWorkspaceId = computed(() => this.facade.currentWorkspaceId())
  readonly skillState = toSignal(
    toObservable(
      computed(() => ({
        ready: this.facade.viewState() === 'ready' && !!this.facade.xpertId(),
        workspaceId: this.skillWorkspaceId(),
        refreshTick: this.skillRefreshTick()
      }))
    ).pipe(
      switchMap(({ ready, workspaceId }) => {
        if (!ready || !workspaceId) {
          return of(EMPTY_SKILL_PREFERENCE_STATE)
        }

        return this.#skillPackageService
          .getAllByWorkspace(workspaceId, { relations: ['skillIndex', 'skillIndex.repository'] })
          .pipe(
            take(1),
            map(({ items }) => buildSkillPreferenceState(workspaceId, items ?? [])),
            catchError((error) =>
              of({
                ...EMPTY_SKILL_PREFERENCE_STATE,
                errorMessage: getErrorMessage(error) || 'Failed to load workspace skills.'
              })
            ),
            startWith({
              ...EMPTY_SKILL_PREFERENCE_STATE,
              loading: true
            })
          )
      })
    ),
    { initialValue: EMPTY_SKILL_PREFERENCE_STATE }
  )
  readonly toolItems = computed(() => this.toolState().tools)
  readonly toolErrors = computed(() => this.toolState().errors)
  readonly skillItems = computed(() => this.skillState().skills)
  readonly busy = computed(() => {
    return Object.keys(this.pendingPreferenceItems()).length > 0 || this.installingSkillPackage()
  })
  readonly isBlocked = computed(() => this.facade.viewState() !== 'ready' || !this.facade.xpertId())
  readonly blockedState = computed(() => {
    if (!this.facade.organizationId()) {
      return {
        titleKey: 'PAC.Chat.ClawXpert.ToolPreferenceOrganizationRequiredTitle',
        defaultTitle: 'Choose an organization first',
        descKey: 'PAC.Chat.ClawXpert.ToolPreferenceOrganizationRequiredDesc',
        defaultDesc: 'Select an organization and finish the ClawXpert setup before managing skills and tools.'
      }
    }

    if (!this.facade.resolvedPreference()) {
      return {
        titleKey: 'PAC.Chat.ClawXpert.ToolPreferenceBindingRequiredTitle',
        defaultTitle: 'Bind ClawXpert before managing tools',
        descKey: 'PAC.Chat.ClawXpert.ToolPreferenceBindingRequiredDesc',
        defaultDesc: 'Once a ClawXpert binding is ready, this panel will load tools from the bound xpert draft.'
      }
    }

    return {
      titleKey: 'PAC.Chat.ClawXpert.ToolPreferenceUnavailableTitle',
      defaultTitle: 'Tool preferences are temporarily unavailable',
      descKey: 'PAC.Chat.ClawXpert.ToolPreferenceUnavailableDesc',
      defaultDesc: 'The ClawXpert shell must be in the ready state before skills and tools can be managed.'
    }
  })

  selectTab(tab: ToolPreferenceTab) {
    this.activeTab.set(tab)
  }

  isSaving(id: string) {
    return !!this.pendingPreferenceItems()[id]
  }

  async toggleTool(item: ToolPreferenceItem, enabled: boolean) {
    if (this.busy()) {
      return
    }

    this.pendingPreferenceItems.set({ [item.id]: true })
    try {
      await this.facade.setToolEnabled(item.sourceType, item.nodeKey, item.metadata, item.toolName, enabled)
    } finally {
      this.pendingPreferenceItems.set({})
    }
  }

  async toggleSkill(item: SkillPreferenceItem, enabled: boolean) {
    if (this.busy()) {
      return
    }

    this.pendingPreferenceItems.set({ [item.id]: true })
    try {
      await this.facade.setSkillEnabled(item.workspaceId, item.packageId, enabled)
    } finally {
      this.pendingPreferenceItems.set({})
    }
  }

  openSkillInstallDialog() {
    if (!this.skillWorkspaceId() || this.installingSkillPackage()) {
      return
    }

    this.#dialog
      .open(XpertSkillInstallDialogComponent, {
        width: 'min(96vw, 72rem)',
        maxWidth: '72rem',
        data: {
          workspaceId: this.skillWorkspaceId()
        }
      })
      .afterClosed()
      .pipe(take(1))
      .subscribe((result) => {
        if (result) {
          this.handleSkillInstallDialogResult(result)
        }
      })
  }

  handleSkillInstallDialogResult(result: XpertSkillInstallDialogResult) {
    if (result.kind === 'repository-index') {
      this.installSkill(result.skillIndex)
      return
    }

    if (result.packages.length) {
      this.refreshSkills()
    }
  }

  installSkill(item: ISkillRepositoryIndex) {
    const workspaceId = this.skillWorkspaceId()
    if (!workspaceId || this.installingSkillPackage()) {
      return
    }

    this.installingSkillPackage.set(true)
    this.#skillPackageService
      .installPackage(workspaceId, item.id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.installingSkillPackage.set(false)
          this.refreshSkills()
        },
        error: (error) => {
          this.installingSkillPackage.set(false)
          this.#toastr.error(getErrorMessage(error) || 'Failed to install the selected skill.')
        }
      })
  }

  private refreshSkills() {
    this.skillRefreshTick.update((value) => value + 1)
  }
}

function collectToolsetNodes(draft: TXpertTeamDraft) {
  return (draft.nodes ?? []).filter(
    (node): node is TXpertTeamNode<'toolset'> => node.type === 'toolset' && !!node.entity?.id
  )
}

function collectMiddlewareNodes(draft: TXpertTeamDraft) {
  return (draft.nodes ?? []).filter(
    (node): node is TXpertTeamNode<'workflow'> =>
      node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.MIDDLEWARE
  )
}

function buildToolsetPreferenceState(
  node: TXpertTeamNode<'toolset'>,
  toolset: TXpertTeamNode<'toolset'>['entity']
): ToolPreferenceState {
  const tools =
    getEnabledTools(toolset)?.map((tool) => ({
      id: buildToolPreferenceId('toolset', node.key, tool.name),
      sourceType: 'toolset' as const,
      nodeKey: node.key,
      toolName: tool.name,
      label: getToolLabel(tool),
      description: tool.description,
      sourceLabel: toolset.name,
      metadata: {
        toolsetId: toolset.id,
        toolsetName: toolset.name
      } satisfies ClawXpertToolPreferenceSourceMetadata
    })) ?? []

  return {
    loading: false,
    tools,
    errors: []
  }
}

function buildMiddlewarePreferenceState(
  nodeKey: string,
  middleware: IWFNMiddleware,
  meta: TAgentMiddlewareMeta | undefined,
  tools: Array<{ name: string; description?: string }>
): ToolPreferenceState {
  return {
    loading: false,
    tools: tools
      .filter((tool) => isMiddlewareToolEnabled(middleware.tools?.[tool.name]))
      .map((tool) => ({
        id: buildToolPreferenceId('middleware', nodeKey, tool.name),
        sourceType: 'middleware' as const,
        nodeKey,
        toolName: tool.name,
        label: tool.name,
        description: tool.description,
        sourceLabel: meta?.label ?? middleware.provider,
        metadata: {
          provider: middleware.provider
        } satisfies ClawXpertToolPreferenceSourceMetadata
      })),
    errors: []
  }
}

function buildSourceErrorState(
  sourceId: string,
  sourceLabel: string | I18nObject,
  message: string
): ToolPreferenceState {
  return {
    loading: false,
    tools: [],
    errors: [
      {
        id: sourceId,
        sourceLabel,
        message
      }
    ]
  }
}

function buildToolPreferenceId(sourceType: ClawXpertToolPreferenceSourceType, nodeKey: string, toolName: string) {
  return `${sourceType}:${nodeKey}:${toolName}`
}

function buildSkillPreferenceState(workspaceId: string, skills: ISkillPackage[]): SkillPreferenceState {
  return {
    loading: false,
    skills: skills.map((skill) => ({
      id: buildSkillPreferenceId(workspaceId, skill.id),
      packageId: skill.id,
      workspaceId,
      skillId:
        skill.skillIndex?.skillId ?? skill.metadata?.name ?? (typeof skill.name === 'string' ? skill.name : skill.id),
      label:
        skill.metadata?.displayName ??
        normalizeI18nCandidate(skill.name) ??
        skill.metadata?.name ??
        skill.skillIndex?.name ??
        skill.skillIndex?.skillId ??
        skill.id,
      summary:
        skill.metadata?.summary ??
        skill.metadata?.description ??
        normalizeI18nCandidate(skill.metadata?.description) ??
        skill.skillIndex?.description ??
        null,
      repositoryName: skill.skillIndex?.repository?.name ?? null,
      provider: skill.skillIndex?.repository?.provider ?? null
    })),
    errorMessage: null
  }
}

function buildSkillPreferenceId(workspaceId: string, skillId: string) {
  return `skill:${workspaceId}:${skillId}`
}

function normalizeI18nCandidate(value: unknown): string | I18nObject | null {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as I18nObject
  }

  return null
}
