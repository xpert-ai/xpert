import { CommonModule } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardCardImports,
  ZardDividerComponent,
  ZardIconComponent,
  ZardMenuImports
} from '@xpert-ai/headless-ui'
import { AiModelTypeEnum, ICopilotModel, IXpert } from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { CopilotModelSelectComponent } from '../../../@shared/copilot'
import { ClawXpertFacade } from './clawxpert.facade'
import { ClawXpertPreferencesEditorComponent } from './clawxpert-preferences-editor.component'
import { ClawXpertScheduledTasksComponent } from './clawxpert-scheduled-tasks.component'
import { ClawXpertSetupWizardComponent } from './clawxpert-setup-wizard.component'
import { ClawXpertToolPreferencesComponent } from './clawxpert-tool-preferences.component'
import { ClawXpertTriggerConfigEditorComponent } from './clawxpert-trigger-config-editor.component'

type ClawXpertMetric = {
  labelKey: string
  defaultLabel: string
  value: number
}

type ClawXpertDocumentCard = {
  labelKey: string
  defaultLabel: string
  descriptionKey: string
  defaultDescription: string
  words: number
}

type ClawXpertHeatmapCell = {
  key: string
  count: number
  title: string
  isFuture: boolean
  background: string
  borderColor: string
  opacity: number
}

type ClawXpertHeatmapWeek = {
  key: string
  monthLabel: string
  cells: ClawXpertHeatmapCell[]
}

type ClawXpertHeatmapModel = {
  weeks: ClawXpertHeatmapWeek[]
  dayLabels: string[]
  totalMessages: number
  activeDays: number
}

const HEATMAP_WEEK_COUNT = 12
const HEATMAP_DAYS_PER_WEEK = 7
const HEATMAP_DAY_LABEL_INDEXES = new Set([0, 2, 4, 6])
const HEATMAP_LEGEND_LEVELS = [0, 0.35, 0.65, 1]

@Component({
  standalone: true,
  selector: 'pac-clawxpert-overview',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardDividerComponent,
    ZardIconComponent,
    CopilotModelSelectComponent,
    EmojiAvatarComponent,
    ClawXpertPreferencesEditorComponent,
    ClawXpertScheduledTasksComponent,
    ClawXpertTriggerConfigEditorComponent,
    ClawXpertToolPreferencesComponent,
    ClawXpertSetupWizardComponent,
    ...ZardMenuImports,
    ...ZardCardImports
  ],
  styleUrls: ['./clawxpert-overview.component.css'],
  template: `
    <div class="h-full min-h-0">
      @if (facade.loading()) {
        <div
          class="flex h-full min-h-[32rem] items-center justify-center rounded-3xl bg-background-default-subtle px-6 text-sm text-text-secondary"
        >
          {{ 'PAC.Chat.ClawXpert.Loading' | translate: { Default: 'Preparing ClawXpert…' } }}
        </div>
      } @else if (!facade.organizationId()) {
        <div
          class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-3xl border border-dashed border-divider-regular bg-background-default-subtle px-6 text-center"
        >
          <z-icon zType="domain" class="text-3xl text-text-tertiary"></z-icon>
          <div class="mt-4 text-base font-medium text-text-primary">
            {{
              'PAC.Chat.ClawXpert.OrganizationRequired'
                | translate: { Default: 'Select an organization to use ClawXpert' }
            }}
          </div>
          <div class="mt-2 max-w-sm text-sm text-text-secondary">
            {{
              'PAC.Chat.ClawXpert.OrganizationRequiredDesc'
                | translate: { Default: 'ClawXpert stores one assistant binding per user and per organization.' }
            }}
          </div>
        </div>
      } @else if (facade.viewState() === 'error') {
        <div
          class="flex h-full min-h-[32rem] flex-col items-center justify-center rounded-3xl border border-divider-regular bg-background-default-subtle px-6 text-center"
        >
          <z-icon zType="warning" class="text-3xl text-text-tertiary"></z-icon>
          <div class="mt-4 text-base font-medium text-text-primary">
            {{ 'PAC.Chat.ClawXpert.LoadFailed' | translate: { Default: 'Failed to load ClawXpert.' } }}
          </div>
          <div class="mt-2 max-w-sm text-sm text-text-secondary">
            {{ facade.viewErrorMessage() }}
          </div>
        </div>
      } @else if (facade.viewState() === 'wizard') {
        <pac-clawxpert-setup-wizard class="block h-full p-8" />
      } @else {
        <div class="flex">
          <div class="w-100 shrink-0 flex h-full min-h-0 flex-col gap-5 overflow-auto p-6 sticky top-0 z-10">
            <div class="flex items-start gap-4">
              <emoji-avatar
                class="shrink-0 overflow-hidden rounded-[2rem] border border-divider-regular bg-background-default-subtle text-2xl shadow-sm"
                [style.width.px]="96"
                [style.height.px]="96"
                [avatar]="xpertAvatar()"
                [alt]="avatarLabel()"
                [fallbackLabel]="avatarLabel()"
              />

              <div class="min-w-0">
                <div class="text-xs uppercase tracking-[0.24em] text-text-tertiary">
                  {{ facade.definition.labelKey | translate: { Default: facade.definition.defaultLabel } }}
                </div>
                <div class="mt-2 text-2xl font-semibold tracking-tight text-text-primary">
                  {{ headerTitle() }}
                </div>
                <p class="mt-3 line-clamp-3 text-sm leading-6 text-text-secondary" [title]="overviewDescription()">
                  {{ overviewDescription() }}
                </p>
              </div>
            </div>

            @if (facade.resolvedPreference() && facade.viewState() === 'ready') {
              <div class="flex rounded-lg border border-border">
                <button class="flex-1 rounded-l-lg rounded-r-none"
                  z-button
                  zType="ghost"
                  displayDensity="cosy"
                  type="button"
                  z-menu
                  [zMenuTriggerFor]="copilotModelMenu"
                  [disabled]="facade.savingCopilotModel()"
                >
                  <span class="flex min-w-0 items-center gap-2">
                    <i class="ri-sparkling-2-line text-sm"></i>
                    <span class="truncate">{{ modelSelectButtonLabel() }}</span>
                  </span>
                </button>
                <button
                  z-button
                  zType="ghost"
                  displayDensity="cosy"
                  type="button"
                  zSize="icon"
                  class="shrink-0 rounded-none rounded-r-lg border-0 border-l border-border px-3"
                  z-menu
                  [zMenuTriggerFor]="actionMenu"
                  [disabled]="facade.clearing() || facade.savingCopilotModel()"
                  [attr.aria-label]="'PAC.Chat.ClawXpert.MoreActions' | translate: { Default: 'More actions' }"
                >
                  <z-icon zType="more_vert"></z-icon>
                </button>
              </div>

              <ng-template #copilotModelMenu>
                <div z-menu-content class="w-[26rem] max-w-[calc(100vw-4rem)] overflow-visible p-0">
                  <div class="p-4">
                    <div class="text-sm font-medium text-text-primary">
                      {{ 'PAC.Copilot.SelectModel' | translate: { Default: 'Select model' } }}
                    </div>
                    <p class="mt-1 text-xs leading-5 text-text-secondary">
                      {{
                        'PAC.Chat.ClawXpert.CopilotModelDesc'
                          | translate
                            : {
                                Default: 'Switch the model used by the bound ClawXpert xpert without leaving this page.'
                              }
                      }}
                    </p>

                    <z-divider zSpacing="sm" class="my-3"></z-divider>

                    <copilot-model-select
                      class="block w-full"
                      hiddenLabel
                      [readonly]="facade.savingCopilotModel()"
                      [modelType]="eModelType.LLM"
                      [ngModel]="selectedCopilotModel()"
                      (ngModelChange)="updateCopilotModel($event)"
                    />

                    @if (facade.savingCopilotModel()) {
                      <div class="mt-3 text-xs text-text-tertiary">
                        {{
                          'PAC.Chat.ClawXpert.CopilotModelSaving'
                            | translate: { Default: 'Saving model selection…' }
                        }}
                      </div>
                    }
                  </div>
                </div>
              </ng-template>

              <ng-template #actionMenu>
                <div z-menu-content class="w-56">
                  <button type="button" z-menu-item (click)="openWizard()">
                    {{ 'PAC.Chat.ClawXpert.Change' | translate: { Default: 'Change ClawXpert' } }}
                  </button>

                  <z-divider zSpacing="sm"></z-divider>

                  <button type="button" z-menu-item [disabled]="facade.clearing()" (click)="clearPreference()">
                    {{ 'PAC.Chat.ClawXpert.Clear' | translate: { Default: 'Clear ClawXpert' } }}
                  </button>
                </div>
              </ng-template>
            }

            <div class="flex flex-wrap items-center gap-2">
              <span
                class="inline-flex items-center rounded-full border border-divider-regular bg-background-default-subtle px-3 py-1 text-xs text-text-secondary"
              >
                {{
                  (facade.resolvedPreference() ? 'PAC.Chat.ClawXpert.StatusBound' : 'PAC.Chat.ClawXpert.StatusPending')
                    | translate: { Default: facade.resolvedPreference() ? 'Bound' : 'Setup required' }
                }}
              </span>
              <span
                class="inline-flex items-center rounded-full border border-divider-regular bg-background-default-subtle px-3 py-1 text-xs text-text-secondary"
              >
                {{ modelLabel() }}
              </span>
            </div>

            <div class="grid grid-cols-3 gap-3">
              @for (metric of metrics(); track metric.labelKey) {
                <div class="px-3 py-4 text-center">
                  <div class="text-2xl font-semibold text-text-primary">{{ metric.value }}</div>
                  <div class="mt-2 text-xs text-text-tertiary">
                    {{ metric.labelKey | translate: { Default: metric.defaultLabel } }}
                  </div>
                </div>
              }
            </div>

            <div class="grid gap-2" [class.grid-cols-2]="facade.hasPersistedDraft()">
              <button
                z-button
                zType="default"

                type="button"
                class="w-full"
                [disabled]="facade.viewState() !== 'ready' || facade.publishingXpert()"
                (click)="startConversation()"
              >
                <z-icon zType="chat"></z-icon>
                {{ 'PAC.Chat.ClawXpert.GoToChat' | translate: { Default: 'Go to chat' } }}
              </button>

              @if (facade.hasPersistedDraft()) {
                <button
                  z-button
                  zType="outline"

                  type="button"
                  class="w-full"
                  [disabled]="facade.viewState() !== 'ready' || facade.publishingXpert() || facade.loadingTriggerDraft()"
                  (click)="publishXpert()"
                >
                  <z-icon zType="upload"></z-icon>
                  {{ 'PAC.Xpert.Publish' | translate: { Default: 'Publish' } }}
                </button>
              }
            </div>

            <div class="px-4 py-4">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-text-primary">
                    {{ 'PAC.Chat.ClawXpert.ConversationStatsTitle' | translate: { Default: 'Conversation stats' } }}
                  </div>
                  <p class="mt-1 text-sm leading-6 text-text-secondary">
                    {{
                      'PAC.Chat.ClawXpert.ConversationStatsDesc'
                        | translate
                          : {
                              Default: 'Daily message volume between you and this assistant over the last 12 weeks.'
                            }
                    }}
                  </p>
                </div>

                <div class="grid shrink-0 grid-cols-2 gap-2">
                  <div class="rounded-2xl border border-divider-regular bg-background-default px-3 py-2 text-center">
                    <div class="text-lg font-semibold text-text-primary">{{ heatmap().totalMessages }}</div>
                    <div class="mt-1 text-[11px] text-text-tertiary">
                      {{ 'PAC.Chat.ClawXpert.TotalMessages' | translate: { Default: 'Total messages' } }}
                    </div>
                  </div>
                  <div class="rounded-2xl border border-divider-regular bg-background-default px-3 py-2 text-center">
                    <div class="text-lg font-semibold text-text-primary">{{ heatmap().activeDays }}</div>
                    <div class="mt-1 text-[11px] text-text-tertiary">
                      {{ 'PAC.Chat.ClawXpert.ActiveDays' | translate: { Default: 'Active days' } }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="mt-4 overflow-x-auto">
                <div class="flex min-w-[18.5rem] gap-2">
                  <div class="grid grid-rows-8 gap-1 text-[10px] text-text-tertiary">
                    <div class="h-4"></div>
                    @for (label of heatmap().dayLabels; track $index) {
                      <div class="flex h-5 items-center justify-end pr-1">
                        {{ label }}
                      </div>
                    }
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="grid grid-cols-12 gap-1 text-[10px] text-text-tertiary">
                      @for (week of heatmap().weeks; track week.key) {
                        <div class="h-4 truncate">{{ week.monthLabel }}</div>
                      }
                    </div>

                    <div class="mt-1 grid grid-cols-12 gap-1">
                      @for (week of heatmap().weeks; track week.key) {
                        <div class="grid grid-rows-7 gap-1">
                          @for (cell of week.cells; track cell.key) {
                            <div
                              class="h-5 w-5 rounded-md border transition-colors"
                              [style.background-color]="cell.background"
                              [style.border-color]="cell.borderColor"
                              [style.opacity]="cell.opacity"
                              [attr.aria-label]="cell.title"
                              [attr.title]="cell.title"
                            ></div>
                          }
                        </div>
                      }
                    </div>
                  </div>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div class="text-xs text-text-tertiary">
                  @if (heatmap().totalMessages === 0) {
                    {{
                      'PAC.Chat.ClawXpert.NoMessageActivity'
                        | translate
                          : {
                              Default: 'No message activity yet. Start a conversation to populate this heatmap.'
                            }
                    }}
                  }
                </div>

                <div class="flex items-center gap-2 text-[11px] text-text-tertiary">
                  <span>{{ 'PAC.Chat.ClawXpert.HeatmapLegendQuiet' | translate: { Default: 'Quiet' } }}</span>
                  @for (legendCell of heatmapLegend; track legendCell.background) {
                    <div
                      class="h-3 w-3 rounded-[4px] border"
                      [style.background-color]="legendCell.background"
                      [style.border-color]="legendCell.borderColor"
                      [style.opacity]="legendCell.opacity"
                    ></div>
                  }
                  <span>{{ 'PAC.Chat.ClawXpert.HeatmapLegendBusy' | translate: { Default: 'Busy' } }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="flex-1 min-h-0 p-4 flex flex-col gap-4 overflow-hidden">
            <pac-clawxpert-preferences-editor />
            <pac-clawxpert-trigger-config-editor />
            <pac-clawxpert-scheduled-tasks />
            <pac-clawxpert-tool-preferences />
          </div>
        </div>
      }
    </div>
  `
})
export class ClawXpertOverviewComponent {
  readonly eModelType = AiModelTypeEnum
  readonly facade = inject(ClawXpertFacade)
  readonly #translate = inject(TranslateService)
  readonly #locale = normalizeLocale(this.#translate.currentLang || this.#translate.getDefaultLang())

  readonly xpertAvatar = computed(() => this.facade.currentXpert()?.avatar ?? null)
  readonly avatarLabel = computed(() => this.facade.currentXpertLabel() || this.headerTitle())
  readonly headerTitle = computed(() => {
    return (
      this.facade.currentXpert()?.title ||
      this.facade.currentXpert()?.name ||
      this.#translate.instant(this.facade.definition.titleKey, {
        Default: this.facade.definition.defaultTitle
      })
    )
  })
  readonly overviewDescription = computed(() => {
    if (!this.facade.resolvedPreference()) {
      return this.#translate.instant('PAC.Chat.ClawXpert.OverviewEmptyDesc', {
        Default: 'Bind one published Xpert first. Once ready, this panel becomes the editable ClawXpert workspace.'
      })
    }

    return this.facade.currentXpertDescription()
  })
  readonly modelLabel = computed(() =>
    buildModelLabel(this.facade.currentXpert(), this.facade.resolvedPreference()?.assistantId)
  )
  readonly selectedCopilotModel = computed<Partial<ICopilotModel> | null>(() => {
    return this.facade.triggerDraft()?.team?.copilotModel ?? this.facade.currentXpert()?.copilotModel ?? null
  })
  readonly modelSelectButtonLabel = computed(() => {
    const model = this.selectedCopilotModel()?.model?.trim()
    if (model) {
      return this.#translate.instant('PAC.Chat.ClawXpert.CopilotModelSelected', {
        model,
        Default: `Model: ${model}`
      })
    }

    return this.#translate.instant('PAC.Copilot.SelectModel', {
      Default: 'Select model'
    })
  })
  readonly metrics = computed<ClawXpertMetric[]>(() => [
    {
      labelKey: 'PAC.Chat.ClawXpert.BoundDays',
      defaultLabel: 'Companion days',
      value: this.facade.boundDays()
    },
    {
      labelKey: 'PAC.Chat.ClawXpert.ConversationCount',
      defaultLabel: 'Conversations',
      value: this.facade.conversationCount()
    },
    {
      labelKey: 'PAC.Chat.ClawXpert.TaskCount',
      defaultLabel: 'Tasks',
      value: this.facade.taskCount()
    }
  ])
  readonly heatmap = computed<ClawXpertHeatmapModel>(() =>
    buildHeatmapModel(this.facade.dailyMessageSeries(), this.#locale, this.#translate)
  )
  readonly heatmapLegend = HEATMAP_LEGEND_LEVELS.map((level) => buildHeatmapStyles(level, false))
  readonly documentCards = computed<ClawXpertDocumentCard[]>(() => [
    {
      labelKey: 'PAC.Chat.ClawXpert.TabBehavior',
      defaultLabel: 'Behavior Guidelines',
      descriptionKey: 'PAC.Chat.ClawXpert.BehaviorEditorDesc',
      defaultDescription: 'Edit the markdown file that defines the assistant behavior baseline for this binding.',
      words: countWords(this.facade.userPreference()?.soul)
    },
    {
      labelKey: 'PAC.Chat.ClawXpert.TabUserProfile',
      defaultLabel: 'User Profile',
      descriptionKey: 'PAC.Chat.ClawXpert.UserProfileEditorDesc',
      defaultDescription: 'Capture stable user context in markdown so future sessions can start with better grounding.',
      words: countWords(this.facade.userPreference()?.profile)
    }
  ])

  startConversation() {
    void this.facade.startConversation()
  }

  publishXpert() {
    void this.facade.publishXpert()
  }

  openWizard() {
    this.facade.openWizard()
  }

  async clearPreference() {
    await this.facade.clearPreference()
  }

  updateCopilotModel(copilotModel: Partial<ICopilotModel> | null) {
    void this.facade.updateCurrentXpertCopilotModel(copilotModel)
  }
}

function buildModelLabel(xpert: IXpert | null, assistantId?: string | null) {
  if (xpert?.version) {
    return `v${xpert.version}`
  }

  return xpert?.slug || assistantId || 'ClawXpert'
}

function countWords(value?: string | null) {
  const content = value?.trim()
  if (!content) {
    return 0
  }

  return content.split(/\s+/).length
}

function buildHeatmapModel(
  series: Array<{ date: string; count: number }>,
  locale: string,
  translate: TranslateService
): ClawXpertHeatmapModel {
  const today = startOfDay(new Date())
  const currentWeekStart = startOfWeek(today)
  const firstWeekStart = addDays(currentWeekStart, -((HEATMAP_WEEK_COUNT - 1) * HEATMAP_DAYS_PER_WEEK))
  const counts = new Map<string, number>()

  for (const item of series ?? []) {
    const dateKey = normalizeHeatmapDateKey(item?.date)
    if (!dateKey) {
      continue
    }

    counts.set(dateKey, (counts.get(dateKey) ?? 0) + Number(item.count ?? 0))
  }

  const totalMessages = Array.from(counts.values()).reduce((sum, count) => sum + count, 0)
  const activeDays = Array.from(counts.values()).filter((count) => count > 0).length
  const maxCount = Math.max(0, ...counts.values())
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short' })
  const dayFormatter = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  const dateFormatter = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' })
  const dayLabels = Array.from({ length: HEATMAP_DAYS_PER_WEEK }, (_, dayIndex) => {
    if (!HEATMAP_DAY_LABEL_INDEXES.has(dayIndex)) {
      return ''
    }

    return dayFormatter.format(addDays(currentWeekStart, dayIndex))
  })

  const weeks = Array.from({ length: HEATMAP_WEEK_COUNT }, (_, weekIndex) => {
    const weekStart = addDays(firstWeekStart, weekIndex * HEATMAP_DAYS_PER_WEEK)
    const labelDate = getMonthLabelDate(weekStart, weekIndex === 0)

    return {
      key: formatDateKey(weekStart),
      monthLabel: labelDate ? monthFormatter.format(labelDate) : '',
      cells: Array.from({ length: HEATMAP_DAYS_PER_WEEK }, (_, dayIndex) => {
        const date = addDays(weekStart, dayIndex)
        const dateKey = formatDateKey(date)
        const count = counts.get(dateKey) ?? 0
        const isFuture = date.getTime() > today.getTime()
        const title = buildHeatmapCellTitle(date, count, isFuture, dateFormatter, translate)
        const styles = buildHeatmapStyles(maxCount > 0 ? count / maxCount : 0, isFuture)

        return {
          key: `${dateKey}-${dayIndex}`,
          count,
          title,
          isFuture,
          background: styles.background,
          borderColor: styles.borderColor,
          opacity: styles.opacity
        }
      })
    }
  })

  return {
    weeks,
    dayLabels,
    totalMessages,
    activeDays
  }
}

function buildHeatmapCellTitle(
  date: Date,
  count: number,
  isFuture: boolean,
  formatter: Intl.DateTimeFormat,
  translate: TranslateService
) {
  const formattedDate = formatter.format(date)

  if (isFuture) {
    return translate.instant('PAC.Chat.ClawXpert.HeatmapCellFuture', {
      date: formattedDate,
      Default: `${formattedDate}: upcoming`
    })
  }

  if (count > 0) {
    return translate.instant('PAC.Chat.ClawXpert.HeatmapCellTitle', {
      date: formattedDate,
      count,
      Default: `${formattedDate}: ${count} messages`
    })
  }

  return translate.instant('PAC.Chat.ClawXpert.HeatmapCellEmpty', {
    date: formattedDate,
    Default: `${formattedDate}: 0 messages`
  })
}

function buildHeatmapStyles(level: number, isFuture: boolean) {
  if (isFuture) {
    return {
      background: 'var(--color-components-toggle-bg-unchecked)',
      borderColor: 'var(--color-components-toggle-bg-unchecked)',
      opacity: 0.24
    }
  }

  if (level <= 0) {
    return {
      background: 'var(--color-components-toggle-bg-unchecked)',
      borderColor: 'var(--color-divider-regular)',
      opacity: 0.14
    }
  }

  return {
    background: 'var(--color-state-success-solid)',
    borderColor: 'var(--color-state-success-solid)',
    opacity: Math.min(1, Math.max(0.24, Number((0.24 + level * 0.76).toFixed(3))))
  }
}

function normalizeLocale(value?: string | null) {
  return value || 'en'
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfWeek(date: Date) {
  const next = startOfDay(date)
  next.setDate(next.getDate() - next.getDay())
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getMonthLabelDate(weekStart: Date, includeWeekStart: boolean) {
  if (includeWeekStart) {
    return weekStart
  }

  for (let dayIndex = 0; dayIndex < HEATMAP_DAYS_PER_WEEK; dayIndex++) {
    const date = addDays(weekStart, dayIndex)
    if (date.getDate() === 1) {
      return date
    }
  }

  return null
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizeHeatmapDateKey(value?: string | null) {
  const normalizedValue = value?.trim()

  if (!normalizedValue) {
    return null
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return normalizedValue
  }

  const date = new Date(normalizedValue)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  return formatDateKey(date)
}
