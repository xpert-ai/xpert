import { CommonModule } from '@angular/common'
import { Component, computed, inject, Input, signal } from '@angular/core'
import { Dialog } from '@angular/cdk/dialog'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { XpI18nPipe } from '@xpert-ai/headless-ui'
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
  TAgentMiddlewareDescriptor,
  TAgentMiddlewareMeta,
  TXpertTeamDraft,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentService,
  XpertToolsetService
} from '../../../@core'
import { XpertSkillInstallDialogComponent, XpertSkillInstallDialogResult } from '../../../@shared/skills'
import { XpertSkillUploadDialogComponent } from '../../xpert/workspace/skills/skill-upload-dialog.component'
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
  selector: 'xp-clawxpert-tool-preferences',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    XpI18nPipe,
    ZardButtonComponent,
    ZardIconComponent,
    ZardSwitchComponent,
    ...ZardCardImports,
    ...ZardTabsImports
  ],
  template: `
    <z-card
      [class]="
        skillsOnly
          ? 'flex min-h-0 flex-col overflow-hidden border-0 bg-transparent shadow-none'
          : 'flex min-h-0 flex-col overflow-hidden rounded-3xl border border-border shadow-none'
      "
    >
      <z-card-content class="flex min-h-0 flex-1 flex-col bg-transparent p-0">
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
            @if (skillsOnly) {
              {{ 'XP.Chat.ClawXpert.LoadingWorkspaceSkills' | translate: { Default: 'Loading workspace skills…' } }}
            } @else {
              {{ 'XP.Chat.ClawXpert.LoadingToolPreferences' | translate: { Default: 'Loading tool preferences…' } }}
            }
          </div>
        } @else if (facade.triggerDraftErrorMessage()) {
          <div class="flex min-h-[20rem] flex-1 flex-col items-center justify-center px-6 text-center">
            <z-icon zType="warning" class="text-3xl text-text-tertiary"></z-icon>
            <div class="mt-4 text-lg font-semibold text-text-primary">
              @if (skillsOnly) {
                {{
                  'XP.Chat.ClawXpert.WorkspaceSkillsLoadFailed'
                    | translate: { Default: 'Failed to load workspace skills' }
                }}
              } @else {
                {{
                  'XP.Chat.ClawXpert.ToolPreferencesLoadFailed'
                    | translate: { Default: 'Failed to load skills and tools.' }
                }}
              }
            </div>
            <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
              {{ facade.triggerDraftErrorMessage() }}
            </p>
          </div>
        } @else {
          @if (!skillsOnly) {
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
                {{ 'XP.Workflow.Skill' | translate: { Default: 'Skill' } }}
              </button>
              <button z-tab-link type="button" [active]="activeTab() === 'tools'" (click)="selectTab('tools')">
                {{ 'XP.Common.Tools' | translate: { Default: 'Tools' } }}
              </button>
            </nav>
          }

          <z-tab-nav-panel #tabPanel class="flex min-h-0 flex-1 flex-col overflow-hidden">
            @if (activeTab() === 'skills') {
              <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  [class]="
                    skillsOnly
                      ? 'flex flex-wrap items-start justify-between gap-4 border-b border-divider-regular pb-6'
                      : 'flex flex-wrap items-start justify-between gap-3 border-b border-divider-regular px-5 py-4'
                  "
                >
                  <div [class]="skillsOnly ? 'flex min-w-0 items-start gap-3' : 'min-w-0'">
                    @if (skillsOnly) {
                      <div
                        class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-divider-regular bg-background-default-subtle"
                      >
                        <i class="ri-pencil-ruler-line text-xl text-text-primary" aria-hidden="true"></i>
                      </div>
                    }
                    <div class="min-w-0">
                      @if (skillsOnly) {
                        <h1 class="text-2xl font-semibold text-text-primary">
                          {{ 'XP.KEY_WORDS.Skills' | translate: { Default: '技能' } }}
                        </h1>
                      } @else {
                        <div class="text-sm font-medium text-text-primary">
                          {{ 'XP.Chat.ClawXpert.SkillPreferencesTitle' | translate: { Default: 'Skill preferences' } }}
                        </div>
                      }
                      <p class="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                        @if (skillsOnly) {
                          {{
                            'XP.Chat.ClawXpert.WorkspaceSkillsPageDesc'
                              | translate
                                : {
                                    Default:
                                      'Upload team skill packages, or install and refresh built-in platform skills. These actions do not republish the business assistant.'
                                  }
                          }}
                        } @else {
                          {{
                            'XP.Chat.ClawXpert.SkillPreferencesDesc'
                              | translate
                                : {
                                    Default:
                                      'Choose which installed workspace skills stay available to this ClawXpert. Preferences are saved per user and used by runtime skill filtering.'
                                  }
                          }}
                        }
                      </p>
                    </div>
                  </div>

                  @if (skillsOnly) {
                    <div class="flex flex-wrap items-center justify-end gap-2">
                      <button
                        z-button
                        zType="outline"
                        zSize="sm"
                        type="button"
                        [disabled]="busy() || !skillWorkspaceId()"
                        (click)="openSkillUploadDialog()"
                      >
                        <i class="ri-upload-2-line" aria-hidden="true"></i>
                        {{ 'XP.Skill.UploadSkills' | translate: { Default: '上传技能' } }}
                      </button>
                      <button
                        z-button
                        zType="default"
                        zSize="sm"
                        type="button"
                        [disabled]="busy() || !skillWorkspaceId()"
                        (click)="openSkillInstallDialog()"
                      >
                        <i class="ri-box-3-line" aria-hidden="true"></i>
                        {{ 'XP.Chat.ClawXpert.InstallOrRefreshSkills' | translate: { Default: '安装/刷新内置技能' } }}
                      </button>
                    </div>
                  } @else {
                    <span
                      class="inline-flex items-center rounded-full border border-divider-regular bg-background-default-subtle px-3 py-1 text-xs text-text-secondary"
                    >
                      {{
                        'XP.Chat.ClawXpert.SkillCount'
                          | translate
                            : {
                                Default: '{count} skills',
                                count: skillItems().length
                              }
                      }}
                    </span>
                  }
                </div>

                <div
                  [class]="
                    skillsOnly ? 'min-h-0 flex-1 overflow-visible pt-8' : 'min-h-0 flex-1 overflow-auto px-5 py-4'
                  "
                >
                  @if (skillsOnly) {
                    <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
                      <div class="space-y-1">
                        <h2 class="text-base font-medium text-text-primary">
                          {{ 'XP.Chat.ClawXpert.SkillCatalogTitle' | translate: { Default: '技能目录' } }}
                        </h2>
                        <p class="text-sm text-text-secondary">
                          {{
                            'XP.Chat.ClawXpert.SkillCatalogDescription'
                              | translate
                                : {
                                    Default: '查看并管理当前工作区已安装的技能，技能状态会从 xpert 平台实时同步。'
                                  }
                          }}
                        </p>
                      </div>
                      <button
                        z-button
                        zType="outline"
                        zSize="sm"
                        type="button"
                        data-skill-catalog-refresh
                        [disabled]="skillState().loading || busy() || !skillWorkspaceId()"
                        (click)="refreshSkills()"
                      >
                        <i class="ri-refresh-line" [class.animate-spin]="skillState().loading" aria-hidden="true"></i>
                        {{ 'XP.ACTIONS.Refresh' | translate: { Default: '刷新' } }}
                      </button>
                    </div>
                  }

                  @if (!skillWorkspaceId()) {
                    <div
                      class="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular px-6 text-center"
                    >
                      <z-icon zType="work_history" class="text-3xl text-text-tertiary"></z-icon>
                      <div class="mt-4 text-lg font-semibold text-text-primary">
                        {{
                          'XP.Chat.ClawXpert.WorkspaceRequiredForSkillsTitle'
                            | translate: { Default: 'This ClawXpert is not attached to a workspace yet' }
                        }}
                      </div>
                      <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                        {{
                          'XP.Chat.ClawXpert.WorkspaceRequiredForSkillsDesc'
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
                          'XP.Chat.ClawXpert.LoadingWorkspaceSkills'
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
                                  'XP.Chat.ClawXpert.WorkspaceSkillsLoadFailed'
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
                              'XP.Chat.ClawXpert.NoSkillsAvailableTitle'
                                | translate: { Default: 'No workspace skills installed yet' }
                            }}
                          </div>
                          <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                            {{
                              'XP.Chat.ClawXpert.NoSkillsAvailableDesc'
                                | translate
                                  : {
                                      Default:
                                        'Open the install dialog and add a skill to this workspace to make it available here immediately.'
                                    }
                            }}
                          </p>
                        </div>
                      } @else {
                        <div [class]="skillsOnly ? 'grid gap-4 xl:grid-cols-2' : 'grid gap-3 md:grid-cols-2'">
                          @for (item of skillItems(); track item.id) {
                            <div
                              [class]="
                                skillsOnly
                                  ? 'rounded-xl border border-divider-regular bg-components-card-bg p-5'
                                  : 'rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-4'
                              "
                            >
                              <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0 flex-1">
                                  <div class="truncate text-base font-semibold text-text-primary">
                                    {{ item.label | i18n }}
                                  </div>
                                  <div class="mt-1 line-clamp-2 text-sm leading-6 text-text-secondary">
                                    {{
                                      (item.summary | i18n) ||
                                        ('XP.Chat.ClawXpert.SkillSummaryFallback'
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
                                    {{ 'XP.Common.Saving' | translate: { Default: 'Saving…' } }}
                                  </span>
                                }
                              </div>
                            </div>
                          }
                        </div>
                      }

                      @if (!skillsOnly) {
                        <div class="mt-6 rounded-2xl border border-divider-regular bg-background-default p-4">
                          <div class="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div class="text-sm font-medium text-text-primary">
                                {{
                                  'XP.Chat.ClawXpert.InstallWorkspaceSkillsTitle'
                                    | translate: { Default: 'Install skills into this workspace' }
                                }}
                              </div>
                              <p class="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                                {{
                                  'XP.Chat.ClawXpert.InstallWorkspaceSkillsDesc'
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
                                {{ 'XP.Chat.ClawXpert.InstallingSkill' | translate: { Default: 'Installing…' } }}
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
                                'XP.Chat.ClawXpert.BrowseWorkspaceSkills'
                                  | translate: { Default: 'Browse & install skills' }
                              }}
                            </button>
                          </div>
                        </div>
                      }
                    }
                  }
                </div>
              </div>
            } @else if (!skillsOnly) {
              <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div class="border-b border-divider-regular px-5 py-4">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div class="text-sm font-medium text-text-primary">
                        {{ 'XP.Chat.ClawXpert.ToolPreferencesTitle' | translate: { Default: 'Tool preferences' } }}
                      </div>
                      <p class="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                        {{
                          'XP.Chat.ClawXpert.ToolPreferencesDesc'
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
                        'XP.Chat.ClawXpert.ToolCount'
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
                        'XP.Chat.ClawXpert.LoadingToolPreferences' | translate: { Default: 'Loading tool preferences…' }
                      }}
                    </div>
                  } @else if (!toolItems().length && !toolErrors().length) {
                    <div
                      class="flex min-h-[16rem] flex-col items-center justify-center rounded-2xl border border-dashed border-divider-regular px-6 text-center"
                    >
                      <z-icon zType="build" class="text-3xl text-text-tertiary"></z-icon>
                      <div class="mt-4 text-lg font-semibold text-text-primary">
                        {{
                          'XP.Chat.ClawXpert.NoToolsAvailableTitle' | translate: { Default: 'No tools available yet' }
                        }}
                      </div>
                      <p class="mt-2 max-w-xl text-sm leading-6 text-text-secondary">
                        {{
                          'XP.Chat.ClawXpert.NoToolsAvailableDesc'
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
                                      ? ('XP.Chat.ClawXpert.ToolsetToolFallbackDesc'
                                        | translate
                                          : {
                                              Default: 'Built-in tool available from this connected toolset.'
                                            })
                                      : ('XP.Chat.ClawXpert.MiddlewareToolFallbackDesc'
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
                                {{ 'XP.Common.Saving' | translate: { Default: 'Saving…' } }}
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
  /** Render only the ClawXpert skill preferences when embedded from the workspace menu. */
  readonly #skillsOnly = signal(false)

  @Input()
  set skillsOnly(value: boolean) {
    this.#skillsOnly.set(value)
  }

  get skillsOnly() {
    return this.#skillsOnly()
  }

  readonly facade = inject(ClawXpertFacade)
  readonly #uploadDialog = inject(Dialog, { optional: true })
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
    initialValue: [] as TAgentMiddlewareDescriptor[]
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
    if (this.skillsOnly) {
      if (!this.facade.organizationId()) {
        return {
          titleKey: 'XP.Chat.ClawXpert.SkillPreferenceOrganizationRequiredTitle',
          defaultTitle: 'Choose an organization first',
          descKey: 'XP.Chat.ClawXpert.SkillPreferenceOrganizationRequiredDesc',
          defaultDesc: 'Select an organization and finish the ClawXpert setup before managing skills.'
        }
      }

      if (!this.facade.resolvedPreference()) {
        return {
          titleKey: 'XP.Chat.ClawXpert.SkillPreferenceBindingRequiredTitle',
          defaultTitle: 'Bind ClawXpert before managing skills',
          descKey: 'XP.Chat.ClawXpert.SkillPreferenceBindingRequiredDesc',
          defaultDesc: 'Once the ClawXpert binding is ready, this page will load skills from its workspace.'
        }
      }

      return {
        titleKey: 'XP.Chat.ClawXpert.SkillPreferenceUnavailableTitle',
        defaultTitle: 'Skill preferences are temporarily unavailable',
        descKey: 'XP.Chat.ClawXpert.SkillPreferenceUnavailableDesc',
        defaultDesc: 'The ClawXpert shell must be ready before skills can be managed.'
      }
    }

    if (!this.facade.organizationId()) {
      return {
        titleKey: 'XP.Chat.ClawXpert.ToolPreferenceOrganizationRequiredTitle',
        defaultTitle: 'Choose an organization first',
        descKey: 'XP.Chat.ClawXpert.ToolPreferenceOrganizationRequiredDesc',
        defaultDesc: 'Select an organization and finish the ClawXpert setup before managing skills and tools.'
      }
    }

    if (!this.facade.resolvedPreference()) {
      return {
        titleKey: 'XP.Chat.ClawXpert.ToolPreferenceBindingRequiredTitle',
        defaultTitle: 'Bind ClawXpert before managing tools',
        descKey: 'XP.Chat.ClawXpert.ToolPreferenceBindingRequiredDesc',
        defaultDesc: 'Once a ClawXpert binding is ready, this panel will load tools from the bound xpert draft.'
      }
    }

    return {
      titleKey: 'XP.Chat.ClawXpert.ToolPreferenceUnavailableTitle',
      defaultTitle: 'Tool preferences are temporarily unavailable',
      descKey: 'XP.Chat.ClawXpert.ToolPreferenceUnavailableDesc',
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

  openSkillUploadDialog() {
    const workspaceId = this.skillWorkspaceId()
    if (!workspaceId || this.busy() || !this.#uploadDialog) {
      return
    }

    this.#uploadDialog
      .open(XpertSkillUploadDialogComponent, {
        data: { workspaceId }
      })
      .closed.pipe(take(1))
      .subscribe((result) => {
        if (result) {
          this.refreshSkills()
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

  refreshSkills() {
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
