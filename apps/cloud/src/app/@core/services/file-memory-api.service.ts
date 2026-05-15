import { inject, Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { API_PREFIX } from '@xpert-ai/cloud/state'
import { toParams } from '@xpert-ai/core'
import { TFile, TFileDirectory } from '../types'

export type TFileMemoryDreamConfig = {
  dreamerXpertId?: string
  dreamerAgentKey?: string
  gate?: Partial<TFileMemoryDreamGateConfig>
  defaults: {
    dreamerXpertId?: string
    dreamerAgentKey?: string
    gate?: Partial<TFileMemoryDreamGateConfig>
  }
}

export type TFileMemoryDreamGateConfig = {
  enabled: boolean
  minIntervalMinutes: number
  minNewOrUpdatedMemories: number
  minConversationCount: number
}

export type TFileMemoryDreamGateResult = {
  passed: boolean
  lastRunId?: string
  lastFinishedAt?: string
  checkedSince?: string
  newOrUpdatedMemoryCount: number
  conversationCount: number
  elapsedMinutes?: number
  config: TFileMemoryDreamGateConfig
  reasons: string[]
}

export type TFileMemoryDreamRunSummary = {
  runId: string
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled' | 'skipped'
  reason: 'manual' | 'scheduled' | 'signal_threshold'
  requestedAt: string
  startedAt?: string
  finishedAt?: string
  error?: string
  changedFileCount?: number
  unresolvedConflictCount?: number
  gate?: TFileMemoryDreamGateResult
}

export type TFileMemoryDreamRunDetail = {
  summary: TFileMemoryDreamRunSummary
  preflight?: string
  report?: {
    runId: string
    xpertId: string
    status: TFileMemoryDreamRunSummary['status']
    changedFiles: Array<{
      path: string
      changeType: 'created' | 'updated' | 'archived'
      reason: string
    }>
    unresolvedConflicts: Array<{
      path?: string
      reason: string
    }>
    dreamDiary: string
  }
  validation?: {
    ok: boolean
    status: 'succeeded' | 'partial' | 'skipped'
    issues: Array<{
      type: string
      message: string
      path?: string
      line?: number
    }>
  }
  artifacts: Array<{
    label: string
    path: string
    kind: 'json' | 'markdown' | 'jsonl' | 'directory'
    exists: boolean
  }>
}

@Injectable({ providedIn: 'root' })
export class FileMemoryApiService {
  readonly #httpClient = inject(HttpClient)
  readonly #apiBaseUrl = `${API_PREFIX}/xpert`

  getFiles(xpertId: string, path = '') {
    return this.#httpClient.get<TFileDirectory[]>(`${this.#apiBaseUrl}/${xpertId}/memory/files`, {
      params: toParams({
        path
      })
    })
  }

  getFile(xpertId: string, path: string) {
    return this.#httpClient.get<TFile>(`${this.#apiBaseUrl}/${xpertId}/memory/file`, {
      params: toParams({
        path
      })
    })
  }

  saveFile(xpertId: string, path: string, content: string) {
    return this.#httpClient.put<TFile>(`${this.#apiBaseUrl}/${xpertId}/memory/file`, {
      path,
      content
    })
  }

  uploadFile(xpertId: string, file: File, path = '') {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', path)
    return this.#httpClient.post<TFile>(`${this.#apiBaseUrl}/${xpertId}/memory/file/upload`, formData)
  }

  deleteFile(xpertId: string, path: string) {
    return this.#httpClient.delete<void>(`${this.#apiBaseUrl}/${xpertId}/memory/file`, {
      params: toParams({
        path
      })
    })
  }

  triggerDream(xpertId: string) {
    return this.#httpClient.post<TFileMemoryDreamRunSummary>(`${this.#apiBaseUrl}/${xpertId}/memory/dream`, {
      reason: 'manual'
    })
  }

  getDreamConfig(xpertId: string) {
    return this.#httpClient.get<TFileMemoryDreamConfig>(`${this.#apiBaseUrl}/${xpertId}/memory/dream/config`)
  }

  saveDreamConfig(xpertId: string, config: Pick<TFileMemoryDreamConfig, 'dreamerXpertId' | 'dreamerAgentKey' | 'gate'>) {
    return this.#httpClient.put<TFileMemoryDreamConfig>(`${this.#apiBaseUrl}/${xpertId}/memory/dream/config`, config)
  }

  listDreamRuns(xpertId: string) {
    return this.#httpClient.get<TFileMemoryDreamRunSummary[]>(`${this.#apiBaseUrl}/${xpertId}/memory/dream/runs`)
  }

  getDreamRun(xpertId: string, runId: string) {
    return this.#httpClient.get<TFileMemoryDreamRunDetail>(`${this.#apiBaseUrl}/${xpertId}/memory/dream/runs/${runId}`)
  }
}

export function injectFileMemoryAPI() {
  return inject(FileMemoryApiService)
}
