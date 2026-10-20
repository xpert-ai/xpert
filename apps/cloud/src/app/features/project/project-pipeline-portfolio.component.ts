import { CommonModule } from '@angular/common'
import { Component, effect, inject, input, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import type { IXpertProject, ProjectPipelinePortfolio } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage } from '@cloud/app/@core'
import { XpertProjectApiService } from './project-api.service'

@Component({
  standalone: true,
  selector: 'xp-project-pipeline-portfolio',
  imports: [CommonModule, RouterLink, TranslateModule, ZardButtonComponent],
  template: `
    <section
      class="flex flex-col gap-4 border-y border-divider-subtle py-5"
      aria-labelledby="pipeline-portfolio-heading"
    >
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="pipeline-portfolio-heading" class="text-lg font-semibold text-text-primary">
            {{ 'XP.XProject.Portfolio.Title' | translate }}
          </h2>
          <p class="mt-1 text-sm text-text-secondary">{{ 'XP.XProject.Portfolio.Scope' | translate }}</p>
        </div>
        <div class="flex items-center gap-2">
          <select
            #windowInput
            class="rounded-md border border-divider-subtle bg-components-input-bg px-3 py-2 text-sm"
            [attr.aria-label]="'XP.XProject.Portfolio.Window' | translate"
            [value]="days()"
            (change)="changeWindow(windowInput.value)"
          >
            <option value="1">{{ 'XP.XProject.Portfolio.Day' | translate }}</option>
            <option value="7">{{ 'XP.XProject.Portfolio.Week' | translate }}</option>
            <option value="30">{{ 'XP.XProject.Portfolio.Month' | translate }}</option>
          </select>
          <button z-button zType="outline" [disabled]="loading() || !projects().length" (click)="refresh()">
            {{ (loading() ? 'XP.XProject.Portfolio.Loading' : 'XP.XProject.Portfolio.Refresh') | translate }}
          </button>
        </div>
      </header>
      <p class="text-sm text-text-secondary">
        {{ 'XP.XProject.Portfolio.Selection' | translate: { count: projects().length } }}:
        @for (project of projects(); track project.id; let last = $last) {
          {{ project.name }}{{ last ? '' : ' · ' }}
        }
      </p>
      @if (error()) {
        <p role="alert" class="text-sm text-text-destructive">{{ error() }}</p>
      }
      @if (report(); as data) {
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div>
            <p class="text-xs text-text-tertiary">{{ 'XP.XProject.Portfolio.Business' | translate }}</p>
            <p class="mt-1 text-xl font-semibold">
              {{ data.totals.current.business.completed }} / {{ data.totals.current.business.total }}
            </p>
          </div>
          <div>
            <p class="text-xs text-text-tertiary">{{ 'XP.XProject.Portfolio.NeedsYou' | translate }}</p>
            <p class="mt-1 text-xl font-semibold">{{ data.totals.current.needsYou }}</p>
          </div>
          <div>
            <p class="text-xs text-text-tertiary">{{ 'XP.XProject.Portfolio.Attempts' | translate }}</p>
            <p class="mt-1 text-xl font-semibold">{{ data.totals.executions.attempts.total }}</p>
          </div>
          <div>
            <p class="text-xs text-text-tertiary">{{ 'XP.XProject.Portfolio.SuccessRate' | translate }}</p>
            <p class="mt-1 text-xl font-semibold">{{ percent(data.totals.executions.attempts.successRate) }}</p>
          </div>
          <div>
            <p class="text-xs text-text-tertiary">{{ 'XP.XProject.Portfolio.Tokens' | translate }}</p>
            <p class="mt-1 text-xl font-semibold">{{ data.totals.modelUsage?.totalTokens ?? '—' }}</p>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[920px] text-left text-sm">
            <thead class="border-b border-divider-subtle text-xs text-text-tertiary">
              <tr>
                <th class="py-3 pr-4">{{ 'XP.XProject.ProjectColumn' | translate }}</th>
                <th class="pr-4">{{ 'XP.XProject.Portfolio.Business' | translate }}</th>
                <th class="pr-4">{{ 'XP.XProject.Portfolio.NeedsYou' | translate }}</th>
                <th class="pr-4">{{ 'XP.XProject.Portfolio.Attempts' | translate }}</th>
                <th class="pr-4">{{ 'XP.XProject.Portfolio.SuccessRate' | translate }}</th>
                <th class="pr-4">{{ 'XP.XProject.Portfolio.ExecutionP95' | translate }}</th>
                <th class="pr-4">{{ 'XP.XProject.Portfolio.QueueP95' | translate }}</th>
                <th class="pr-4">{{ 'XP.XProject.Portfolio.HumanWait' | translate }}</th>
                <th class="pr-4">{{ 'XP.XProject.Portfolio.Tokens' | translate }}</th>
                <th>{{ 'XP.XProject.Portfolio.Cost' | translate }}</th>
              </tr>
            </thead>
            <tbody>
              @for (row of data.byProject; track row.projectId) {
                <tr class="border-b border-divider-subtle">
                  <td class="py-3 pr-4">
                    <a
                      class="font-medium text-primary hover:underline"
                      [routerLink]="['/project', row.projectId, 'timeline']"
                      >{{ name(row.projectId) }}</a
                    >
                  </td>
                  <td class="pr-4">{{ row.current.business.completed }} / {{ row.current.business.total }}</td>
                  <td class="pr-4">{{ row.current.needsYou }}</td>
                  <td class="pr-4">{{ row.executions.attempts.total }}</td>
                  <td class="pr-4">{{ percent(row.executions.attempts.successRate) }}</td>
                  <td class="pr-4">{{ duration(row.executions.timing.p95Ms) }}</td>
                  <td class="pr-4">{{ duration(row.queue?.total?.dispatchWait?.p95Ms) }}</td>
                  <td class="pr-4">
                    {{ duration(row.humanWait?.observedUnionMs) }}
                    @if (
                      row.humanWait?.coverage?.missingEvents ||
                      row.humanWait?.coverage?.invalidEvents ||
                      row.humanWait?.coverage?.currentUntrackedNodes
                    ) {
                      <span class="block text-xs text-text-tertiary">{{
                        'XP.XProject.Portfolio.Partial' | translate
                      }}</span>
                    }
                  </td>
                  <td class="pr-4">{{ row.modelUsage?.totalTokens ?? '—' }}</td>
                  <td>
                    @for (cost of row.modelUsage?.costs ?? []; track cost.currency) {
                      <span class="block whitespace-nowrap"
                        >{{ cost.currency }} {{ cost.amount | number: '1.2-6' }}</span
                      >
                    } @empty {
                      —
                    }
                    @if (row.modelUsage?.unpricedCalls) {
                      <span class="block text-xs text-text-tertiary">{{
                        'XP.XProject.Portfolio.Partial' | translate
                      }}</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="flex flex-col gap-1 text-xs text-text-tertiary">
          <p>
            {{ 'XP.XProject.Portfolio.Observed' | translate }}: {{ data.snapshotAt | date: 'medium' }} ·
            {{ data.window.from | date: 'short' }} – {{ data.window.to | date: 'short' }}
          </p>
          <p>
            {{
              'XP.XProject.Portfolio.Coverage'
                | translate
                  : {
                      missing: data.totals.coverage.attemptsWithoutStartTime,
                      unavailable: data.totals.executions.timing.unavailable,
                      shared: data.sharedAcrossProjects
                    }
            }}
          </p>
          <p>{{ 'XP.XProject.Portfolio.Unknown' | translate }}</p>
          @if (data.totals.modelUsage; as usage) {
            <p>
              {{
                'XP.XProject.Portfolio.UsageCoverage'
                  | translate
                    : {
                        observed: usage.executionsWithRecords,
                        requested: usage.requestedExecutions,
                        calls: usage.calls,
                        unpriced: usage.unpricedCalls
                      }
              }}
              @for (cost of usage.costs; track cost.currency) {
                · {{ cost.currency }} {{ cost.amount | number: '1.2-6' }}
              }
            </p>
            @if (usage.truncated || usage.rejectedRecords) {
              <p>{{ 'XP.XProject.Portfolio.IncompleteUsage' | translate }}</p>
            }
          }
        </div>
      } @else if (!loading() && !error()) {
        <p class="py-4 text-sm text-text-secondary">{{ 'XP.XProject.Portfolio.Prompt' | translate }}</p>
      }
    </section>
  `
})
export class XpertProjectPipelinePortfolioComponent {
  readonly projects = input.required<IXpertProject[]>()
  readonly days = signal(7)
  readonly report = signal<ProjectPipelinePortfolio | null>(null)
  readonly error = signal<string | null>(null)
  readonly loading = signal(false)
  readonly #api = inject(XpertProjectApiService)
  #sequence = 0

  constructor() {
    effect(() => {
      this.projects()
      this.invalidate()
    })
  }
  private invalidate() {
    this.#sequence++
    this.report.set(null)
    this.error.set(null)
    this.loading.set(false)
  }
  changeWindow(value: string) {
    const days = Number(value)
    if (![1, 7, 30].includes(days)) return
    this.days.set(days)
    this.invalidate()
  }
  async refresh() {
    const projectIds = this.projects().map((project) => project.id)
    if (!projectIds.length || projectIds.length > 50) return
    const sequence = ++this.#sequence,
      to = new Date()
    this.loading.set(true)
    this.error.set(null)
    this.report.set(null)
    try {
      const report = await firstValueFrom(
        this.#api.pipelinePortfolio({
          projectIds,
          window: { from: new Date(to.getTime() - this.days() * 86400_000).toISOString(), to: to.toISOString() }
        })
      )
      if (sequence === this.#sequence) this.report.set(report)
    } catch (error) {
      if (sequence === this.#sequence) this.error.set(getErrorMessage(error))
    } finally {
      if (sequence === this.#sequence) this.loading.set(false)
    }
  }
  name(id: string) {
    return this.projects().find((project) => project.id === id)?.name ?? '—'
  }
  percent(value: number | null) {
    return value === null ? '—' : `${(value * 100).toFixed(1)}%`
  }
  duration(value: number | null | undefined) {
    if (value == null) return '—'
    return value < 60000
      ? `${(value / 1000).toFixed(1)} s`
      : value < 3600000
        ? `${(value / 60000).toFixed(1)} min`
        : `${(value / 3600000).toFixed(1)} h`
  }
}
