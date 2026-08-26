import { CommonModule } from '@angular/common'
import { Component, computed, inject, Input, signal } from '@angular/core'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { injectConfirmDelete, XpI18nPipe } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardCardImports,
  ZardDialogService,
  ZardIconComponent,
  ZardInputDirective,
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
  skillPackage: ISkillPackage
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
    CdkMenuModule,
    XpI18nPipe,
    ZardButtonComponent,
    ZardIconComponent,
    ZardInputDirective,
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
                @if (!skillsOnly) {
                  <div
                    class="flex flex-wrap items-start justify-between gap-3 border-b border-divider-regular px-5 py-4"
                  >
                    <div class="min-w-0">
                      <div class="min-w-0">
                        <div class="text-sm font-medium text-text-primary">
                          {{ 'XP.Chat.ClawXpert.SkillPreferencesTitle' | translate: { Default: 'Skill preferences' } }}
                        </div>
                        <p class="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">
                          {{
                            'XP.Chat.ClawXpert.SkillPreferencesDesc'
                              | translate
                                : {
                                    Default:
                                      'Choose which installed workspace skills stay available to this ClawXpert. Preferences are saved per user and used by runtime skill filtering.'
                                  }
                          }}
                        </p>
                      </div>
                    </div>
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
                  </div>
                }

                <div
                  [class]="skillsOnly ? 'min-h-0 flex-1 overflow-visible' : 'min-h-0 flex-1 overflow-auto px-5 py-4'"
                >
                  @if (skillsOnly) {
                    <div class="mb-6 space-y-4">
                      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div class="flex min-w-0 items-center gap-2">
                          <h1 class="text-2xl font-semibold text-text-primary">
                            {{ 'XP.Explore.InstalledSkills' | translate: { Default: 'Installed' } }}
                          </h1>
                          <span
                            class="inline-flex min-w-6 items-center justify-center rounded-full bg-background-default-subtle px-2 py-0.5 text-sm font-medium text-text-secondary"
                          >
                            {{ skillItems().length }}
                          </span>
                        </div>

                        <div class="flex w-full flex-wrap items-center justify-end gap-2 lg:w-auto">
                          @if (!bulkManaging()) {
                            <button
                              z-button
                              zType="outline"
                              type="button"
                              class="cursor-pointer"
                              data-skill-bulk-management
                              [disabled]="busy() || !skillItems().length"
                              (click)="startBulkManagement()"
                            >
                              <i class="ri-checkbox-multiple-line" aria-hidden="true"></i>
                              {{ 'XP.Chat.ClawXpert.BulkManagement' | translate: { Default: 'Batch management' } }}
                            </button>
                          }

                          <div class="relative min-w-64 flex-1 lg:w-80 lg:flex-none">
                            <i
                              class="ri-search-line pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-text-tertiary"
                              aria-hidden="true"
                            ></i>
                            <input
                              z-input
                              type="search"
                              class="h-10 w-full pl-10 pr-9"
                              [placeholder]="
                                'XP.Chat.ClawXpert.SearchInstalledSkills'
                                  | translate: { Default: 'Search installed skills' }
                              "
                              [ngModel]="skillSearch()"
                              (ngModelChange)="skillSearch.set($event)"
                            />
                            @if (skillSearch()) {
                              <button
                                type="button"
                                class="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-tertiary hover:bg-hover-bg hover:text-text-primary"
                                [attr.aria-label]="'XP.ACTIONS.Clear' | translate: { Default: 'Clear' }"
                                (click)="skillSearch.set('')"
                              >
                                <i class="ri-close-line text-lg" aria-hidden="true"></i>
                              </button>
                            }
                          </div>
                        </div>
                      </div>

                      @if (bulkManaging()) {
                        <div class="flex flex-wrap items-center justify-between gap-3 text-sm text-text-secondary">
                          <div class="flex flex-wrap items-center gap-4">
                            <span>
                              {{
                                'XP.Chat.ClawXpert.SelectedSkills'
                                  | translate
                                    : {
                                        Default: '{count} selected',
                                        count: selectedSkillIds().size
                                      }
                              }}
                            </span>
                            <button
                              type="button"
                              class="cursor-pointer font-medium text-text-primary hover:underline"
                              (click)="selectAllFilteredSkills()"
                            >
                              {{ 'XP.Chat.ClawXpert.SelectAll' | translate: { Default: 'Select all' } }}
                            </button>
                            <button
                              type="button"
                              class="cursor-pointer font-medium text-text-primary hover:underline"
                              (click)="clearSkillSelection()"
                            >
                              {{ 'XP.Chat.ClawXpert.ClearSelection' | translate: { Default: 'Clear' } }}
                            </button>
                          </div>

                          <div class="flex items-center gap-2">
                            <button
                              z-button
                              zType="secondary"
                              type="button"
                              class="cursor-pointer"
                              data-skill-bulk-enable
                              [disabled]="!selectedSkillIds().size || busy()"
                              (click)="setSelectedSkillsEnabled(true)"
                            >
                              <i class="ri-checkbox-circle-line" aria-hidden="true"></i>
                              {{ 'XP.Chat.ClawXpert.EnableSelectedSkills' | translate: { Default: 'Enable' } }}
                            </button>
                            <button
                              z-button
                              zType="secondary"
                              type="button"
                              class="cursor-pointer"
                              data-skill-bulk-disable
                              [disabled]="!selectedSkillIds().size || busy()"
                              (click)="setSelectedSkillsEnabled(false)"
                            >
                              <i class="ri-close-circle-line" aria-hidden="true"></i>
                              {{ 'XP.Chat.ClawXpert.DisableSelectedSkills' | translate: { Default: 'Disable' } }}
                            </button>
                            <button
                              z-button
                              zType="outline"
                              type="button"
                              class="cursor-pointer text-destructive hover:text-destructive"
                              data-skill-bulk-uninstall
                              [disabled]="!selectedSkillIds().size || busy()"
                              (click)="uninstallSelectedSkills()"
                            >
                              <i class="ri-delete-bin-line" aria-hidden="true"></i>
                              {{ 'XP.Chat.ClawXpert.Uninstall' | translate: { Default: 'Uninstall' } }}
                            </button>
                            <button
                              z-button
                              zType="ghost"
                              type="button"
                              class="cursor-pointer"
                              [disabled]="busy()"
                              (click)="cancelBulkManagement()"
                            >
                              {{ 'XP.Chat.ClawXpert.Cancel' | translate: { Default: 'Cancel' } }}
                            </button>
                          </div>
                        </div>
                      }
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
                        @if (skillsOnly && !filteredSkillItems().length) {
                          <div
                            class="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed border-divider-regular px-6 text-center"
                          >
                            <i class="ri-search-line text-3xl text-text-tertiary" aria-hidden="true"></i>
                            <div class="mt-3 text-base font-semibold text-text-primary">
                              {{ 'XP.Chat.ClawXpert.NoMatchingSkills' | translate: { Default: 'No matching skills' } }}
                            </div>
                            <p class="mt-1 text-sm text-text-secondary">
                              {{
                                'XP.Chat.ClawXpert.TryAnotherSkillSearch'
                                  | translate: { Default: 'Try another skill name or description.' }
                              }}
                            </p>
                          </div>
                        } @else {
                          <div
                            [class]="
                              skillsOnly ? 'grid gap-4 md:grid-cols-2 2xl:grid-cols-3' : 'grid gap-3 md:grid-cols-2'
                            "
                          >
                            @for (item of skillsOnly ? filteredSkillItems() : skillItems(); track item.id) {
                              <div
                                [class]="
                                  skillsOnly
                                    ? 'group/skill relative min-h-40 overflow-hidden rounded-xl border border-divider-regular bg-components-card-bg p-5 transition-colors hover:bg-background-default-subtle'
                                    : 'rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-4'
                                "
                              >
                                @if (skillsOnly) {
                                  <div class="flex items-start gap-3">
                                    @if (bulkManaging()) {
                                      <input
                                        type="checkbox"
                                        class="mt-3 size-4 shrink-0 cursor-pointer accent-primary"
                                        [checked]="selectedSkillIds().has(item.id)"
                                        [attr.aria-label]="item.label | i18n"
                                        (change)="toggleSkillSelection(item.id, $event)"
                                      />
                                    }

                                    <div
                                      class="flex size-11 shrink-0 items-center justify-center rounded-full bg-state-success-hover/20 text-text-success"
                                    >
                                      <i class="ri-sparkling-line text-xl" aria-hidden="true"></i>
                                    </div>

                                    <div class="min-w-0 flex-1 pt-1">
                                      <div class="flex min-w-0 items-center gap-2 pr-20">
                                        <div class="truncate text-base font-semibold text-text-primary">
                                          {{ item.label | i18n }}
                                        </div>
                                        @if (isSaving(item.id)) {
                                          <span class="shrink-0 text-xs text-text-tertiary">
                                            {{ 'XP.Common.Saving' | translate: { Default: 'Saving…' } }}
                                          </span>
                                        }
                                      </div>

                                      <div class="mt-4 line-clamp-2 text-sm leading-6 text-text-secondary">
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

                                    <div class="absolute right-4 top-4 flex items-center gap-2">
                                      @if (!bulkManaging()) {
                                        <button
                                          z-button
                                          zType="ghost"
                                          zShape="circle"
                                          zSize="sm"
                                          type="button"
                                          class="size-8 cursor-pointer opacity-0 transition-opacity group-hover/skill:opacity-100 focus-visible:opacity-100"
                                          #skillActionTrigger="cdkMenuTriggerFor"
                                          [class.opacity-100]="skillActionTrigger.isOpen()"
                                          [cdkMenuTriggerFor]="skillActionsMenu"
                                          [cdkMenuTriggerData]="{ item: item }"
                                          [attr.aria-label]="
                                            'XP.Chat.ClawXpert.SkillActions' | translate: { Default: 'Skill actions' }
                                          "
                                        >
                                          <i class="ri-more-fill text-lg" aria-hidden="true"></i>
                                        </button>
                                      }

                                      <z-switch
                                        zSize="sm"
                                        [ngModel]="facade.isSkillEnabled(item.workspaceId, item.packageId)"
                                        [disabled]="isSkillToggleDisabled(item.id)"
                                        (ngModelChange)="toggleSkill(item, $event)"
                                      />
                                    </div>
                                  </div>
                                } @else {
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
                                }
                              </div>
                            }
                          </div>
                        }
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

    <ng-template #skillActionsMenu let-item="item">
      <div cdkMenu class="xp-cdk-menu min-w-48 p-1.5">
        <button
          cdkMenuItem
          type="button"
          class="xp-cdk-menu-item cursor-pointer gap-2"
          [disabled]="isDownloadingSkill(item.packageId) || busy()"
          (click)="downloadSkillPackage(item)"
        >
          <i
            class="ri-download-2-line text-lg"
            [class.animate-spin]="isDownloadingSkill(item.packageId)"
            aria-hidden="true"
          ></i>
          {{ 'XP.Chat.ClawXpert.DownloadSkillPackage' | translate: { Default: 'Download skill package' } }}
        </button>
        <button
          cdkMenuItem
          type="button"
          class="xp-cdk-menu-item danger cursor-pointer gap-2"
          [disabled]="busy()"
          (click)="uninstallSkill(item)"
        >
          <i class="ri-delete-bin-line text-lg" aria-hidden="true"></i>
          {{ 'XP.Chat.ClawXpert.Uninstall' | translate: { Default: 'Uninstall' } }}
        </button>
      </div>
    </ng-template>
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
  readonly #confirmDelete = injectConfirmDelete()
  readonly #translate = inject(TranslateService)

  readonly activeTab = signal<ToolPreferenceTab>('skills')
  readonly pendingPreferenceItems = signal<Record<string, boolean>>({})
  readonly installingSkillPackage = signal(false)
  readonly skillSearch = signal('')
  readonly bulkManaging = signal(false)
  readonly selectedSkillIds = signal<Set<string>>(new Set())
  readonly downloadingSkillIds = signal<Set<string>>(new Set())
  readonly uninstallingSkillIds = signal<Set<string>>(new Set())
  readonly bulkUninstalling = signal(false)
  readonly bulkUpdatingSkills = signal(false)
  readonly skillRefreshTick = signal(0)
  #skillPreferenceSaveQueue: Promise<void> = Promise.resolve()
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
  readonly filteredSkillItems = computed(() => {
    const term = this.skillSearch().trim().toLowerCase()
    if (!term) {
      return this.skillItems()
    }

    return this.skillItems().filter((item) =>
      [item.label, item.summary, item.repositoryName, item.provider, item.skillId]
        .map((value) => searchableSkillText(value))
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  })
  readonly busy = computed(() => {
    return (
      Object.keys(this.pendingPreferenceItems()).length > 0 ||
      this.installingSkillPackage() ||
      this.uninstallingSkillIds().size > 0 ||
      this.bulkUninstalling() ||
      this.bulkUpdatingSkills()
    )
  })
  readonly destructiveSkillBusy = computed(
    () => this.installingSkillPackage() || this.uninstallingSkillIds().size > 0 || this.bulkUninstalling()
  )
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

    this.setPreferenceItemPending(item.id, true)
    try {
      await this.facade.setToolEnabled(item.sourceType, item.nodeKey, item.metadata, item.toolName, enabled)
    } finally {
      this.setPreferenceItemPending(item.id, false)
    }
  }

  async toggleSkill(item: SkillPreferenceItem, enabled: boolean) {
    if (this.isSaving(item.id) || this.destructiveSkillBusy()) {
      return
    }

    this.setPreferenceItemPending(item.id, true)
    try {
      await this.enqueueSkillPreferenceUpdate(item, enabled)
    } finally {
      this.setPreferenceItemPending(item.id, false)
    }
  }

  isSkillToggleDisabled(skillId: string) {
    return this.isSaving(skillId) || this.destructiveSkillBusy()
  }

  startBulkManagement() {
    this.bulkManaging.set(true)
    this.clearSkillSelection()
  }

  cancelBulkManagement() {
    this.bulkManaging.set(false)
    this.clearSkillSelection()
  }

  toggleSkillSelection(skillId: string, event: Event) {
    const checked = (event.target as HTMLInputElement).checked
    this.selectedSkillIds.update((selected) => {
      const next = new Set(selected)
      if (checked) {
        next.add(skillId)
      } else {
        next.delete(skillId)
      }
      return next
    })
  }

  selectAllFilteredSkills() {
    this.selectedSkillIds.set(new Set(this.filteredSkillItems().map((item) => item.id)))
  }

  clearSkillSelection() {
    this.selectedSkillIds.set(new Set())
  }

  async setSelectedSkillsEnabled(enabled: boolean) {
    const selectedItems = this.skillItems().filter((item) => this.selectedSkillIds().has(item.id))
    if (!selectedItems.length || this.busy()) {
      return
    }

    this.bulkUpdatingSkills.set(true)
    selectedItems.forEach((item) => this.setPreferenceItemPending(item.id, true))

    try {
      let allSaved = true
      for (const item of selectedItems) {
        const saved = await this.enqueueSkillPreferenceUpdate(item, enabled)
        allSaved = saved && allSaved
      }

      if (allSaved) {
        this.#toastr.success(
          this.#translate.instant(
            enabled ? 'XP.Chat.ClawXpert.SelectedSkillsEnabled' : 'XP.Chat.ClawXpert.SelectedSkillsDisabled',
            {
              Default: enabled ? 'Selected skills enabled' : 'Selected skills disabled'
            }
          )
        )
      }
    } catch (error) {
      this.#toastr.error(
        getErrorMessage(error) ||
          this.#translate.instant('XP.Chat.ClawXpert.UpdateSelectedSkillsFailed', {
            Default: 'Failed to update the selected skills.'
          })
      )
    } finally {
      selectedItems.forEach((item) => this.setPreferenceItemPending(item.id, false))
      this.bulkUpdatingSkills.set(false)
    }
  }

  isDownloadingSkill(packageId: string) {
    return this.downloadingSkillIds().has(packageId)
  }

  downloadSkillPackage(item: SkillPreferenceItem) {
    if (this.isDownloadingSkill(item.packageId)) {
      return
    }

    this.setDownloadingSkill(item.packageId, true)
    this.#skillPackageService
      .downloadPackage(item.workspaceId, item.packageId)
      .pipe(take(1))
      .subscribe({
        next: (blob) => {
          this.setDownloadingSkill(item.packageId, false)
          triggerSkillPackageDownload(blob, `${toDownloadFileName(skillPackageName(item))}.zip`)
        },
        error: (error) => {
          this.setDownloadingSkill(item.packageId, false)
          this.#toastr.error(
            getErrorMessage(error) ||
              this.#translate.instant('XP.Chat.ClawXpert.DownloadSkillFailed', {
                Default: 'Failed to download the selected skill.'
              })
          )
        }
      })
  }

  uninstallSkill(item: SkillPreferenceItem) {
    if (this.busy()) {
      return
    }

    this.#confirmDelete(
      {
        title: this.#translate.instant('XP.Chat.ClawXpert.UninstallSkillTitle', {
          Default: 'Uninstall skill'
        }),
        value: searchableSkillText(item.label) || item.skillId,
        information: this.#translate.instant('XP.Chat.ClawXpert.UninstallSkillInfo', {
          Default: 'This skill will be removed from the current workspace. This action cannot be undone.'
        })
      },
      () => {
        this.setUninstallingSkill(item.packageId, true)
        return this.#skillPackageService.uninstallPackageInWorkspace(item.workspaceId, item.packageId)
      }
    ).subscribe({
      next: () => {
        this.setUninstallingSkill(item.packageId, false)
        this.removeSelectedSkill(item.id)
        this.#toastr.success(
          this.#translate.instant('XP.Chat.ClawXpert.SkillUninstalled', { Default: 'Skill uninstalled' })
        )
        this.refreshSkills()
      },
      error: (error) => {
        this.setUninstallingSkill(item.packageId, false)
        this.#toastr.error(
          getErrorMessage(error) ||
            this.#translate.instant('XP.Chat.ClawXpert.UninstallSkillFailed', {
              Default: 'Failed to uninstall the selected skill.'
            })
        )
      }
    })
  }

  uninstallSelectedSkills() {
    const selectedItems = this.skillItems().filter((item) => this.selectedSkillIds().has(item.id))
    if (!selectedItems.length || this.busy()) {
      return
    }

    this.#confirmDelete(
      {
        title: this.#translate.instant('XP.Chat.ClawXpert.UninstallSelectedSkillsTitle', {
          Default: 'Uninstall selected skills'
        }),
        value: this.#translate.instant('XP.Chat.ClawXpert.SelectedSkillsValue', {
          Default: `${selectedItems.length} skills`,
          count: selectedItems.length
        }),
        information: this.#translate.instant('XP.Chat.ClawXpert.UninstallSelectedSkillsInfo', {
          Default: 'The selected skills will be removed from the current workspace. This action cannot be undone.'
        })
      },
      () => {
        this.bulkUninstalling.set(true)
        return forkJoin(
          selectedItems.map((item) =>
            this.#skillPackageService.uninstallPackageInWorkspace(item.workspaceId, item.packageId)
          )
        )
      }
    ).subscribe({
      next: () => {
        this.bulkUninstalling.set(false)
        this.cancelBulkManagement()
        this.#toastr.success(
          this.#translate.instant('XP.Chat.ClawXpert.SelectedSkillsUninstalled', {
            Default: 'Selected skills uninstalled'
          })
        )
        this.refreshSkills()
      },
      error: (error) => {
        this.bulkUninstalling.set(false)
        this.#toastr.error(
          getErrorMessage(error) ||
            this.#translate.instant('XP.Chat.ClawXpert.UninstallSelectedSkillsFailed', {
              Default: 'Failed to uninstall the selected skills.'
            })
        )
      }
    })
  }

  private setDownloadingSkill(packageId: string, downloading: boolean) {
    this.downloadingSkillIds.update((items) => updateIdSet(items, packageId, downloading))
  }

  private setPreferenceItemPending(itemId: string, pending: boolean) {
    this.pendingPreferenceItems.update((items) => {
      const next = { ...items }
      if (pending) {
        next[itemId] = true
      } else {
        delete next[itemId]
      }
      return next
    })
  }

  private enqueueSkillPreferenceUpdate(item: SkillPreferenceItem, enabled: boolean) {
    const update = this.#skillPreferenceSaveQueue.then(() =>
      this.facade.setSkillEnabled(item.workspaceId, item.packageId, enabled)
    )
    this.#skillPreferenceSaveQueue = update.then(
      () => undefined,
      () => undefined
    )
    return update
  }

  private setUninstallingSkill(packageId: string, uninstalling: boolean) {
    this.uninstallingSkillIds.update((items) => updateIdSet(items, packageId, uninstalling))
  }

  private removeSelectedSkill(skillId: string) {
    this.selectedSkillIds.update((items) => updateIdSet(items, skillId, false))
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
      provider: skill.skillIndex?.repository?.provider ?? null,
      skillPackage: skill
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

function searchableSkillText(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value)
      .filter((item): item is string => typeof item === 'string')
      .join(' ')
  }
  return ''
}

function skillPackageName(item: SkillPreferenceItem): string {
  return (
    searchableSkillText(item.label) ||
    searchableSkillText(item.skillPackage.metadata?.name) ||
    searchableSkillText(item.skillPackage.name) ||
    item.skillId ||
    item.packageId
  )
}

function updateIdSet(items: Set<string>, id: string, present: boolean): Set<string> {
  const next = new Set(items)
  if (present) {
    next.add(id)
  } else {
    next.delete(id)
  }
  return next
}

function triggerSkillPackageDownload(blob: Blob, fileName: string) {
  const anchor = document.createElement('a')
  const objectUrl = URL.createObjectURL(blob)
  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(objectUrl)
}

function toDownloadFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'skill'
}
