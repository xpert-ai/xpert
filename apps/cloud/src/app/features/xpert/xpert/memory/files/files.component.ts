import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardButtonComponent, ZardInputDirective, ZardSelectImports, ZardSwitchComponent } from '@xpert-ai/headless-ui'
import {
  FileWorkbenchComponent,
  FileWorkbenchFileDeleter,
  FileWorkbenchFileLoader,
  FileWorkbenchFileSaver,
  FileWorkbenchFileUploader,
  FileWorkbenchFilesLoader
} from '@cloud/app/@shared/files'
import {
  getErrorMessage,
  injectFileMemoryAPI,
  injectToastr,
  IXpert,
  OrderTypeEnum,
  TFileMemoryDreamRunDetail,
  TFileMemoryDreamRunSummary,
  XpertAPIService,
  XpertTypeEnum
} from '@cloud/app/@core'
import { XpertComponent } from '../../xpert.component'
import { firstValueFrom, interval, Subscription } from 'rxjs'

type ZardSelectValue = string | number | Array<string | number> | null

@Component({
  standalone: true,
  selector: 'xp-xpert-memory-files',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ZardSwitchComponent,
    ...ZardSelectImports,
    FileWorkbenchComponent
  ],
  templateUrl: './files.component.html',
  styleUrl: './files.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMemoryFilesComponent {
  readonly #fileMemoryAPI = injectFileMemoryAPI()
  readonly #xpertAPI = inject(XpertAPIService)
  readonly #toastr = injectToastr()
  readonly #router = inject(Router)
  readonly #translate = inject(TranslateService)
  readonly xpertComponent = inject(XpertComponent)

  readonly fileWorkbench = viewChild(FileWorkbenchComponent)

  readonly xpertId = this.xpertComponent.paramId
  readonly xpert = computed(() => this.xpertComponent.xpert() ?? this.xpertComponent.latestXpert())
  readonly rootLabel = computed(
    () =>
      this.xpert()?.title ||
      this.xpert()?.name ||
      this.#translate.instant('PAC.Xpert.FileMemoryFiles', { Default: 'Memory files' })
  )
  readonly reloadKey = computed(() => this.xpertId() ?? '__hosted__')
  readonly dreaming = signal(false)
  readonly configSaving = signal(false)
  readonly configLoading = signal(false)
  readonly runsLoading = signal(false)
  readonly runDetailLoading = signal(false)
  readonly dreamerXpertId = signal('')
  readonly dreamerAgentKey = signal('')
  readonly gateEnabled = signal(true)
  readonly gateMinIntervalMinutes = signal(30)
  readonly gateMinNewOrUpdatedMemories = signal(1)
  readonly gateMinConversationCount = signal(1)
  readonly defaultDreamerXpertId = signal('')
  readonly defaultDreamerAgentKey = signal('')
  readonly defaultGateMinIntervalMinutes = signal(30)
  readonly defaultGateMinNewOrUpdatedMemories = signal(1)
  readonly defaultGateMinConversationCount = signal(1)
  readonly dreamerOptions = signal<IXpert[]>([])
  readonly dreamRuns = signal<TFileMemoryDreamRunSummary[]>([])
  readonly selectedRunId = signal<string | null>(null)
  readonly selectedRun = signal<TFileMemoryDreamRunDetail | null>(null)
  readonly selectedDreamer = computed(() => this.dreamerOptions().find((item) => item.id === this.dreamerXpertId()))
  readonly dreamerAgentOptions = computed(() => getAgentKeys(this.selectedDreamer()))
  readonly latestRun = computed(() => this.dreamRuns()[0] ?? null)
  readonly selectedRunSummary = computed(
    () => this.selectedRun()?.summary ?? this.dreamRuns().find((run) => run.runId === this.selectedRunId())
  )
  #polling?: Subscription

  readonly loadMemoryFiles: FileWorkbenchFilesLoader = (path?: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      return []
    }

    return this.#fileMemoryAPI.getFiles(xpertId, path ?? '')
  }

  readonly loadMemoryFile: FileWorkbenchFileLoader = (path: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      throw new Error('Xpert context is required')
    }

    return this.#fileMemoryAPI.getFile(xpertId, path)
  }

  readonly saveMemoryFile: FileWorkbenchFileSaver = (path: string, content: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      throw new Error('Xpert context is required')
    }

    return this.#fileMemoryAPI.saveFile(xpertId, path, content)
  }

  readonly uploadMemoryFile: FileWorkbenchFileUploader = (file: File, path: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      throw new Error('Xpert context is required')
    }

    return this.#fileMemoryAPI.uploadFile(xpertId, file, path)
  }

  readonly deleteMemoryFile: FileWorkbenchFileDeleter = (path: string) => {
    const xpertId = this.xpertId()
    if (!xpertId) {
      throw new Error('Xpert context is required')
    }

    return this.#fileMemoryAPI.deleteFile(xpertId, path)
  }

  readonly effectiveFileSaver = computed<FileWorkbenchFileSaver | null>(() => {
    const activePath = this.fileWorkbench()?.activeFilePath()
    return isManagedMemoryIndexPath(activePath) ? null : this.saveMemoryFile
  })

  readonly effectiveFileDeleter = computed<FileWorkbenchFileDeleter | null>(() => {
    const activePath = this.fileWorkbench()?.activeFilePath()
    return isManagedMemoryIndexPath(activePath) ? null : this.deleteMemoryFile
  })

  readonly effectiveFileUploader = computed<FileWorkbenchFileUploader | null>(() => {
    const activePath = this.fileWorkbench()?.activeFilePath()
    return isManagedMemoryIndexPath(activePath) ? null : this.uploadMemoryFile
  })

  constructor() {
    effect((onCleanup) => {
      const xpertId = this.xpertId()
      this.#polling?.unsubscribe()
      if (!xpertId) {
        return
      }
      void this.loadDreamSetup(xpertId)
      void this.loadDreamRuns(xpertId)
      this.#polling = interval(5000).subscribe(() => {
        void this.loadDreamRuns(xpertId, true)
      })
      onCleanup(() => this.#polling?.unsubscribe())
    })
  }

  triggerDream() {
    const xpertId = this.xpertId()
    if (!xpertId || this.dreaming()) {
      return
    }

    this.dreaming.set(true)
    this.#fileMemoryAPI.triggerDream(xpertId).subscribe({
      next: (run) => {
        this.#toastr.success('PAC.Xpert.FileMemoryDreamQueued', {
          Default: `Dream queued: ${run.runId}`,
          runId: run.runId
        })
        this.selectedRunId.set(run.runId)
        void this.loadDreamRuns(xpertId)
      },
      error: (error) => {
        this.dreaming.set(false)
        this.#toastr.error(getErrorMessage(error))
      },
      complete: () => {
        this.dreaming.set(false)
      }
    })
  }

  async saveDreamConfig() {
    const xpertId = this.xpertId()
    if (!xpertId) {
      return
    }
    this.configSaving.set(true)
    try {
      const config = await firstValueFrom(
        this.#fileMemoryAPI.saveDreamConfig(xpertId, {
          dreamerXpertId: this.dreamerXpertId(),
          dreamerAgentKey: this.dreamerAgentKey(),
          gate: {
            enabled: this.gateEnabled(),
            minIntervalMinutes: this.gateMinIntervalMinutes(),
            minNewOrUpdatedMemories: this.gateMinNewOrUpdatedMemories(),
            minConversationCount: this.gateMinConversationCount()
          }
        })
      )
      this.applyDreamConfig(config)
      this.#toastr.success('PAC.Xpert.FileMemoryDreamConfigSaved', {
        Default: 'Dreamer config saved'
      })
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.configSaving.set(false)
    }
  }

  openDreamerStudio() {
    const dreamerXpertId = this.dreamerXpertId()
    if (dreamerXpertId) {
      void this.#router.navigate(['/xpert/x', dreamerXpertId, 'agents'])
    }
  }

  updateDreamerXpertId(value: ZardSelectValue) {
    this.dreamerXpertId.set(selectValueToString(value))
  }

  updateDreamerAgentKey(value: ZardSelectValue) {
    this.dreamerAgentKey.set(selectValueToString(value))
  }

  updateGateMinIntervalMinutes(value: string | number | null) {
    this.gateMinIntervalMinutes.set(toNonNegativeNumber(value))
  }

  updateGateMinNewOrUpdatedMemories(value: string | number | null) {
    this.gateMinNewOrUpdatedMemories.set(toNonNegativeNumber(value))
  }

  updateGateMinConversationCount(value: string | number | null) {
    this.gateMinConversationCount.set(toNonNegativeNumber(value))
  }

  async selectRun(runId: string) {
    this.selectedRunId.set(runId)
    const xpertId = this.xpertId()
    if (!xpertId) {
      return
    }
    this.runDetailLoading.set(true)
    try {
      this.selectedRun.set(await firstValueFrom(this.#fileMemoryAPI.getDreamRun(xpertId, runId)))
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.runDetailLoading.set(false)
    }
  }

  artifactFilePath(path: string) {
    return path.replace(/^\.dream\//, '.dream/')
  }

  private async loadDreamSetup(xpertId: string) {
    this.configLoading.set(true)
    try {
      const [config, xperts] = await Promise.all([
        firstValueFrom(this.#fileMemoryAPI.getDreamConfig(xpertId)),
        firstValueFrom(
          this.#xpertAPI.getAll({
            where: {
              latest: true,
              type: XpertTypeEnum.Agent
            },
            relations: ['agent', 'agents'],
            order: { updatedAt: OrderTypeEnum.DESC },
            take: 100
          })
        )
      ])
      this.dreamerOptions.set(xperts.items)
      this.applyDreamConfig(config)
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.configLoading.set(false)
    }
  }

  async loadDreamRuns(xpertId?: string | null, silent = false) {
    if (!xpertId) {
      return
    }
    if (!silent) {
      this.runsLoading.set(true)
    }
    try {
      const runs = await firstValueFrom(this.#fileMemoryAPI.listDreamRuns(xpertId))
      this.dreamRuns.set(runs)
      const selected = this.selectedRunId() ?? runs[0]?.runId
      if (selected && selected !== this.selectedRunId()) {
        void this.selectRun(selected)
      }
      const detail = this.selectedRun()
      if (detail && runs.some((run) => run.runId === detail.summary.runId && run.status !== detail.summary.status)) {
        void this.selectRun(detail.summary.runId)
      }
    } catch (error) {
      if (!silent) {
        this.#toastr.error(getErrorMessage(error))
      }
    } finally {
      this.runsLoading.set(false)
    }
  }

  private applyDreamConfig(config: {
    dreamerXpertId?: string
    dreamerAgentKey?: string
    gate?: {
      enabled?: boolean
      minIntervalMinutes?: number
      minNewOrUpdatedMemories?: number
      minConversationCount?: number
    }
    defaults: {
      dreamerXpertId?: string
      dreamerAgentKey?: string
      gate?: {
        enabled?: boolean
        minIntervalMinutes?: number
        minNewOrUpdatedMemories?: number
        minConversationCount?: number
      }
    }
  }) {
    this.defaultDreamerXpertId.set(config.defaults.dreamerXpertId ?? '')
    this.defaultDreamerAgentKey.set(config.defaults.dreamerAgentKey ?? 'FileMemoryDreamer')
    const defaultGate = {
      enabled: true,
      minIntervalMinutes: 30,
      minNewOrUpdatedMemories: 1,
      minConversationCount: 1,
      ...config.defaults.gate
    }
    const gate = {
      ...defaultGate,
      ...config.gate
    }
    this.defaultGateMinIntervalMinutes.set(defaultGate.minIntervalMinutes)
    this.defaultGateMinNewOrUpdatedMemories.set(defaultGate.minNewOrUpdatedMemories)
    this.defaultGateMinConversationCount.set(defaultGate.minConversationCount)
    this.dreamerXpertId.set(config.dreamerXpertId || config.defaults.dreamerXpertId || '')
    this.dreamerAgentKey.set(config.dreamerAgentKey || config.defaults.dreamerAgentKey || 'FileMemoryDreamer')
    this.gateEnabled.set(gate.enabled)
    this.gateMinIntervalMinutes.set(gate.minIntervalMinutes)
    this.gateMinNewOrUpdatedMemories.set(gate.minNewOrUpdatedMemories)
    this.gateMinConversationCount.set(gate.minConversationCount)
  }
}

function isManagedMemoryIndexPath(filePath?: string | null) {
  const normalized = (filePath ?? '').trim().replace(/\\/g, '/')
  return normalized === 'MEMORY.md' || normalized.endsWith('/MEMORY.md')
}

function getAgentKeys(xpert?: IXpert | null) {
  const keys = new Set<string>()
  if (xpert?.agent?.key) {
    keys.add(xpert.agent.key)
  }
  for (const agent of xpert?.agents ?? []) {
    if (agent.key) {
      keys.add(agent.key)
    }
  }
  for (const node of xpert?.graph?.nodes ?? []) {
    if (node.type === 'agent' && node.key) {
      keys.add(node.key)
    }
  }
  return Array.from(keys)
}

function selectValueToString(value: ZardSelectValue) {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (Array.isArray(value)) {
    const first = value[0]
    return first == null ? '' : String(first)
  }
  return ''
}

function toNonNegativeNumber(value: string | number | null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, value) : 0
  }

  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
  }

  return 0
}
