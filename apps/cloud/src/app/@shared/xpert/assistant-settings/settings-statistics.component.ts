import { DIALOG_DATA } from '@angular/cdk/dialog'
import { ChangeDetectionStrategy, Component, computed, inject, OnDestroy, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage, OrderTypeEnum, XpertAPIService, XpertTaskService } from '../../../@core'
import { buildHeatmapLegend } from '../../../features/chat/clawxpert/clawxpert-heatmap.utils'
import { buildHeatmapModel } from './assistant-statistics.utils'
import type { XpertSettingsDialogData } from './xpert-settings.types'

@Component({
  standalone: true,
  selector: 'xp-settings-statistics',
  imports: [TranslateModule, ZardButtonComponent],
  templateUrl: './settings-statistics.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsStatisticsComponent implements OnDestroy {
  private readonly data = inject<XpertSettingsDialogData>(DIALOG_DATA)
  private readonly api = inject(XpertAPIService)
  private readonly tasks = inject(XpertTaskService)
  private readonly translate = inject(TranslateService)
  private readonly language = toSignal(this.translate.onLangChange)
  readonly loading = signal(false)
  readonly error = signal<string | null>(null)
  readonly conversations = signal(0)
  readonly taskCount = signal(0)
  readonly series = signal<Array<{ date: string; count: number }>>([])
  readonly boundDays = computed(() => {
    const created = this.data.binding?.createdAt
    if (!created) return null
    const time = new Date(created).getTime()
    return Number.isFinite(time) ? Math.max(1, Math.floor((Date.now() - time) / 86400000) + 1) : null
  })
  readonly heatmap = computed(() => {
    this.language()
    return buildHeatmapModel(this.series(), this.translate.currentLang || 'en', this.translate)
  })
  readonly legend = buildHeatmapLegend()
  private request = 0

  constructor() {
    void this.load()
  }

  async load() {
    const request = ++this.request
    this.loading.set(true)
    this.error.set(null)
    const end = new Date()
    const start = new Date(end)
    start.setDate(start.getDate() - start.getDay() - 77)
    start.setHours(0, 0, 0, 0)
    try {
      const [conversations, tasks, series] = await Promise.all([
        firstValueFrom(this.api.getConversations(this.data.source.id, { take: 1 }, ['2000-01-01', end.toISOString()])),
        firstValueFrom(
          this.tasks.getMyAll({
            where: { xpertId: this.data.source.id },
            take: 1,
            order: { updatedAt: OrderTypeEnum.DESC }
          })
        ),
        firstValueFrom(
          this.api.getDailyMessages(this.data.source.id, [start.toISOString(), end.toISOString()], {
            currentUserOnly: true
          })
        )
      ])
      if (request !== this.request) return
      this.conversations.set(conversations.total ?? 0)
      this.taskCount.set(tasks.total ?? 0)
      this.series.set(series.map((item) => ({ date: item.date, count: item.count ?? 0 })))
    } catch (error) {
      if (request === this.request) this.error.set(getErrorMessage(error))
    } finally {
      if (request === this.request) this.loading.set(false)
    }
  }

  ngOnDestroy() {
    this.request++
  }
}
