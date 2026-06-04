import {
  ISandboxManagedService,
  TSandboxManagedServiceLogs,
  TSandboxManagedServicePreviewSession
} from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import type { SandboxService } from '../../../@core'

export const CLAWXPERT_MANAGED_SERVICES_REFRESH_INTERVAL_MS = 5000

const LOCAL_SERVICE_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])

export type ClawXpertManagedServicesSandboxApi = Pick<
  SandboxService,
  | 'createManagedServicePreviewSession'
  | 'getManagedServiceLogs'
  | 'listManagedServices'
  | 'restartManagedService'
  | 'stopManagedService'
>

export type ClawXpertManagedServicesBrowserControllerOptions = {
  conversationId?: string | null
  organizationId?: string
}

export type ClawXpertManagedServicesBrowserSnapshot = {
  previewSession: TSandboxManagedServicePreviewSession | null
  previewSessionKey: string | null
  previewSessionUrl: string | null
  selectedServiceId: string | null
  services: ISandboxManagedService[]
}

export type ClawXpertManagedServiceOpenResult = {
  displayUrl: string
  previewSession: TSandboxManagedServicePreviewSession | null
  previewUrl: string | null
  service: ISandboxManagedService
}

export function createClawXpertManagedServicesBrowserController(
  sandboxService: ClawXpertManagedServicesSandboxApi,
  options: ClawXpertManagedServicesBrowserControllerOptions = {}
) {
  return new ClawXpertManagedServicesBrowserController(sandboxService, options)
}

export class ClawXpertManagedServicesBrowserController {
  #autoRefreshCleanup: (() => void) | null = null
  #conversationId: string | null
  #organizationId: string | undefined
  #previewSession: TSandboxManagedServicePreviewSession | null = null
  #previewSessionKey: string | null = null
  #previewSessionUrl: string | null = null
  #selectedServiceId: string | null = null
  #services: ISandboxManagedService[] = []

  constructor(
    private readonly sandboxService: ClawXpertManagedServicesSandboxApi,
    options: ClawXpertManagedServicesBrowserControllerOptions = {}
  ) {
    this.#conversationId = options.conversationId ?? null
    this.#organizationId = options.organizationId
  }

  get conversationId() {
    return this.#conversationId
  }

  get organizationId() {
    return this.#organizationId
  }

  get previewSessionKey() {
    return this.#previewSessionKey
  }

  get previewSession() {
    return this.#previewSession
  }

  get previewSessionUrl() {
    return this.#previewSessionUrl
  }

  get selectedService() {
    return this.#services.find((service) => service.id === this.#selectedServiceId) ?? null
  }

  get selectedServiceId() {
    return this.#selectedServiceId
  }

  get services() {
    return this.#services
  }

  get snapshot(): ClawXpertManagedServicesBrowserSnapshot {
    return {
      previewSession: this.#previewSession,
      previewSessionKey: this.#previewSessionKey,
      previewSessionUrl: this.#previewSessionUrl,
      selectedServiceId: this.#selectedServiceId,
      services: this.#services
    }
  }

  setContext(options: ClawXpertManagedServicesBrowserControllerOptions) {
    const nextConversationId = options.conversationId ?? null
    if (this.#conversationId !== nextConversationId) {
      this.reset()
    }

    this.#conversationId = nextConversationId
    this.#organizationId = options.organizationId
  }

  reset() {
    this.#services = []
    this.clearSelection()
  }

  async refresh() {
    if (!this.#conversationId) {
      this.reset()
      return []
    }

    const services = await firstValueFrom(
      this.sandboxService.listManagedServices(this.#conversationId, this.#organizationId)
    )
    this.#services = services
    this.syncSelectedService()
    return services
  }

  selectService(serviceId: string | null | undefined) {
    const service = serviceId ? this.#services.find((item) => item.id === serviceId) : null
    if (!service?.id) {
      this.clearSelection()
      return null
    }

    this.#selectedServiceId = service.id
    return service
  }

  resolveAddress(address: string) {
    return resolveManagedServiceForAddress(address, this.#services)
  }

  async openByAddress(address: string): Promise<ClawXpertManagedServiceOpenResult | null> {
    const service = this.resolveAddress(address)
    return service?.id ? this.openByServiceId(service.id) : null
  }

  async openByServiceId(serviceId: string): Promise<ClawXpertManagedServiceOpenResult | null> {
    const service = this.selectService(serviceId)
    if (!service) {
      return null
    }

    const previewSession = await this.ensurePreviewSession()
    return {
      displayUrl: formatManagedServiceDisplayUrl(service),
      previewSession,
      previewUrl: this.#previewSessionUrl,
      service
    }
  }

  async ensurePreviewSession() {
    const service = this.selectedService
    const nextKey = buildManagedServicePreviewSessionKey(this.#conversationId, service)
    if (!this.#conversationId || !service?.id || !nextKey) {
      this.#previewSessionKey = null
      this.#previewSessionUrl = null
      return null
    }

    if (this.#previewSessionKey === nextKey && this.#previewSessionUrl) {
      return this.#previewSession
    }

    this.#previewSession = null
    this.#previewSessionKey = null
    this.#previewSessionUrl = null

    const session = await firstValueFrom(
      this.sandboxService.createManagedServicePreviewSession(this.#conversationId, service.id, this.#organizationId)
    )
    if (buildManagedServicePreviewSessionKey(this.#conversationId, this.selectedService) !== nextKey) {
      return null
    }

    this.#previewSession = session
    this.#previewSessionKey = nextKey
    this.#previewSessionUrl = session.previewUrl
    return session
  }

  async getSelectedServiceLogs(tail = 200): Promise<TSandboxManagedServiceLogs | null> {
    const service = this.selectedService
    if (!this.#conversationId || !service?.id) {
      return null
    }

    return firstValueFrom(
      this.sandboxService.getManagedServiceLogs(this.#conversationId, service.id, tail, this.#organizationId)
    )
  }

  async restartSelectedService() {
    const service = this.selectedService
    if (!this.#conversationId || !service?.id) {
      return null
    }

    const restarted = await firstValueFrom(
      this.sandboxService.restartManagedService(this.#conversationId, service.id, this.#organizationId)
    )
    await this.refresh()
    this.selectService(restarted.id)
    return restarted
  }

  async stopSelectedService() {
    const service = this.selectedService
    if (!this.#conversationId || !service?.id) {
      return null
    }

    const stopped = await firstValueFrom(
      this.sandboxService.stopManagedService(this.#conversationId, service.id, this.#organizationId)
    )
    await this.refresh()
    return stopped
  }

  startAutoRefresh(
    onRefresh?: (services: ISandboxManagedService[]) => void | Promise<void>,
    intervalMs = CLAWXPERT_MANAGED_SERVICES_REFRESH_INTERVAL_MS
  ) {
    this.stopAutoRefresh()

    const intervalId = globalThis.setInterval(() => {
      void this.refresh().then((services) => onRefresh?.(services))
    }, intervalMs)

    this.#autoRefreshCleanup = () => {
      globalThis.clearInterval(intervalId)
    }
    return this.#autoRefreshCleanup
  }

  stopAutoRefresh() {
    this.#autoRefreshCleanup?.()
    this.#autoRefreshCleanup = null
  }

  private clearSelection() {
    this.#selectedServiceId = null
    this.#previewSession = null
    this.#previewSessionKey = null
    this.#previewSessionUrl = null
  }

  private syncSelectedService() {
    if (!this.#selectedServiceId) {
      return
    }

    if (!this.#services.some((service) => service.id === this.#selectedServiceId)) {
      this.clearSelection()
    }
  }
}

export function buildManagedServicePreviewSessionKey(
  conversationId: string | null | undefined,
  service: ISandboxManagedService | null | undefined
) {
  if (!conversationId || !service?.id || !service.previewUrl || service.transportMode !== 'http') {
    return null
  }

  return `${conversationId}:${service.id}:${service.previewUrl}`
}

export function formatManagedServiceDisplayUrl(service: ISandboxManagedService) {
  const port = managedServicePort(service)
  if (port !== null) {
    return `localhost:${port}`
  }

  return service.previewUrl || service.name
}

export function resolveManagedServiceForAddress(address: string, services: readonly ISandboxManagedService[]) {
  const parsedUrl = parseManagedServiceAddressUrl(address)
  if (!parsedUrl || !LOCAL_SERVICE_HOSTS.has(parsedUrl.hostname)) {
    return null
  }

  const parsedPort = Number(parsedUrl.port)
  if (!Number.isFinite(parsedPort)) {
    return null
  }

  return (
    services.find((service) => {
      const port = managedServicePort(service)
      return (
        port === parsedPort &&
        service.transportMode === 'http' &&
        isNonEmptyString(service.previewUrl) &&
        isNonEmptyString(service.id)
      )
    }) ?? null
  )
}

function managedServicePort(service: ISandboxManagedService) {
  const port = service.actualPort ?? service.requestedPort
  return typeof port === 'number' && Number.isFinite(port) ? port : null
}

function parseManagedServiceAddressUrl(rawValue: string) {
  const value = rawValue.trim()
  if (!value) {
    return null
  }

  const normalizedValue = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : LOCAL_SERVICE_HOSTS.has(value.split(/[/:]/)[0] ?? '')
      ? `http://${value}`
      : value

  try {
    return new URL(normalizedValue)
  } catch {
    return null
  }
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}
