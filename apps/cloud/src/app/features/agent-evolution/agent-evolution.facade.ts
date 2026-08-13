import { Injectable, computed, inject, signal } from '@angular/core'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import { firstValueFrom } from 'rxjs'
import { AgentEvolutionApiService } from './agent-evolution-api.service'
import {
  EMPTY_EVOLUTION_DASHBOARD,
  type AgentEvolutionDashboard,
  type EvolutionSimulationResult
} from './agent-evolution.types'

@Injectable({ providedIn: 'root' })
export class AgentEvolutionFacade {
  readonly #api = inject(AgentEvolutionApiService)
  readonly #toastr = injectToastr()

  readonly dashboard = signal<AgentEvolutionDashboard>(EMPTY_EVOLUTION_DASHBOARD)
  readonly loading = signal(false)
  readonly synchronizing = signal(false)
  readonly simulating = signal(false)
  readonly error = signal<string | null>(null)
  readonly simulation = signal<EvolutionSimulationResult | null>(null)
  readonly loadedAt = signal<Date | null>(null)

  readonly latestEvaluation = computed(() => this.dashboard().evaluations[0] ?? null)
  readonly latestCandidate = computed(() => this.dashboard().candidates[0] ?? null)
  readonly latestRelease = computed(() => this.dashboard().releases[0] ?? null)
  readonly latestProposal = computed(() => this.dashboard().proposals[0] ?? null)
  readonly isEmpty = computed(
    () => !this.dashboard().events.length && !this.dashboard().candidates.length && !this.dashboard().releases.length
  )

  async load(options: { silent?: boolean } = {}) {
    if (!options.silent) {
      this.loading.set(true)
    }
    this.error.set(null)
    try {
      const dashboard = await firstValueFrom(this.#api.getDashboard())
      this.dashboard.set({ ...EMPTY_EVOLUTION_DASHBOARD, ...dashboard })
      this.loadedAt.set(new Date())
      return dashboard
    } catch (error) {
      const message = getErrorMessage(error)
      this.error.set(message)
      if (!options.silent) {
        this.#toastr.error(message)
      }
      return null
    } finally {
      if (!options.silent) {
        this.loading.set(false)
      }
    }
  }

  async synchronize() {
    this.synchronizing.set(true)
    this.error.set(null)
    try {
      await firstValueFrom(this.#api.synchronizeTargets())
      await this.load({ silent: true })
      this.#toastr.success('XP.AgentEvolution.TargetsSynchronized', {
        Default: '进化目标已同步'
      })
      return true
    } catch (error) {
      const message = getErrorMessage(error)
      this.error.set(message)
      this.#toastr.error(message)
      return false
    } finally {
      this.synchronizing.set(false)
    }
  }

  async runSimulation() {
    this.simulating.set(true)
    this.error.set(null)
    this.simulation.set(null)
    try {
      const result = await firstValueFrom(this.#api.simulateConformance())
      this.simulation.set(result)
      await this.load({ silent: true })
      this.#toastr.success('XP.AgentEvolution.SimulationCompleted', {
        Default: '完整进化模拟已执行并发布'
      })
      return result
    } catch (error) {
      const message = getErrorMessage(error)
      this.error.set(message)
      this.#toastr.error(message)
      return null
    } finally {
      this.simulating.set(false)
    }
  }
}
