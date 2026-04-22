import { CommonModule } from '@angular/common'
import {
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import { TranslateModule } from '@ngx-translate/core'
import {
  ISandboxManagedService,
  TChatElementReference,
  TSandboxManagedServiceLogs,
  TSandboxManagedServiceStatus
} from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { SandboxService, getErrorMessage, injectToastr } from '../../../@core'

type PreviewOverlay = {
  height: number
  label: string
  left: number
  reference: TChatElementReference
  top: number
  width: number
}

type PreviewOverlayTarget = {
  element: Element
  service: ISandboxManagedService
}

const SERVICE_REFRESH_INTERVAL_MS = 3000

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function readTargetElement(value: EventTarget | null): Element | null {
  if (!value || typeof value !== 'object' || !('nodeType' in value) || value.nodeType !== 1) {
    return null
  }

  return value as Element
}

function truncateValue(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, Math.max(0, limit - 3))}...`
}

function normalizeInlineText(value: string | null | undefined): string {
  if (!value) {
    return ''
  }

  return value.replace(/\s+/g, ' ').trim()
}

function escapeCssIdentifier(value: string): string {
  if (typeof globalThis.CSS !== 'undefined' && typeof globalThis.CSS.escape === 'function') {
    return globalThis.CSS.escape(value)
  }

  return value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~ ])/g, '\\$1')
}

function buildSelectorSegment(element: Element): string {
  const tagName = element.tagName.toLowerCase()
  const elementId = element.getAttribute('id')
  if (isNonEmptyString(elementId)) {
    return `#${escapeCssIdentifier(elementId)}`
  }

  const classNames = Array.from(element.classList)
    .filter((className) => className.trim().length > 0)
    .slice(0, 2)
    .map((className) => `.${escapeCssIdentifier(className)}`)
    .join('')

  const parent = element.parentElement
  if (!parent) {
    return `${tagName}${classNames}`
  }

  const sameTagSiblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName)
  if (sameTagSiblings.length <= 1) {
    return `${tagName}${classNames}`
  }

  const position = sameTagSiblings.indexOf(element) + 1
  return `${tagName}${classNames}:nth-of-type(${position})`
}

function buildUniqueSelector(element: Element): string {
  const segments: string[] = []
  let current: Element | null = element

  while (current && current.tagName.toLowerCase() !== 'html') {
    segments.unshift(buildSelectorSegment(current))
    const selector = segments.join(' > ')

    try {
      if (current.ownerDocument.querySelectorAll(selector).length === 1) {
        return selector
      }
    } catch {
      // Ignore invalid intermediate selectors and continue walking upward.
    }

    current = current.parentElement
  }

  return segments.join(' > ')
}

function buildElementLabel(element: Element, selector: string): string {
  const ariaLabel = element.getAttribute('aria-label')
  if (isNonEmptyString(ariaLabel)) {
    return `${element.tagName.toLowerCase()} "${truncateValue(ariaLabel.trim(), 48)}"`
  }

  const text = normalizeInlineText(element.textContent)
  if (text) {
    return `${element.tagName.toLowerCase()} "${truncateValue(text, 48)}"`
  }

  return `${element.tagName.toLowerCase()} ${selector}`
}

function buildElementReference(service: ISandboxManagedService, element: Element): TChatElementReference | null {
  if (!service.id) {
    return null
  }

  const documentRef = element.ownerDocument
  const pageUrl = documentRef.location?.href
  if (!isNonEmptyString(pageUrl)) {
    return null
  }

  const selector = buildUniqueSelector(element)
  const attributes = Array.from(element.attributes).map(({ name, value }) => ({
    name,
    value: truncateValue(value, 300)
  }))
  const text = normalizeInlineText(element.textContent)

  return {
    attributes,
    label: buildElementLabel(element, selector),
    outerHtml: truncateValue(element.outerHTML, 4000),
    pageTitle: normalizeInlineText(documentRef.title) || undefined,
    pageUrl,
    role: element.getAttribute('role') || undefined,
    selector,
    serviceId: service.id,
    tagName: element.tagName.toLowerCase(),
    text: truncateValue(text || element.tagName.toLowerCase(), 1000),
    type: 'element'
  }
}

@Component({
  standalone: true,
  selector: 'pac-clawxpert-conversation-preview',
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-divider-regular bg-components-card-bg">
      <div class="border-b border-divider-regular px-4 py-3">
        <div class="flex flex-col gap-3">
          <div class="flex flex-wrap items-start gap-3">
            <div class="min-w-[12rem] flex-1">
              <div class="text-xs uppercase tracking-[0.18em] text-text-tertiary">
                {{ 'PAC.Chat.ClawXpert.Browser' | translate: { Default: 'Browser' } }}
              </div>
              <div class="mt-1 text-sm text-text-secondary">
                {{
                  'PAC.Chat.ClawXpert.PreviewDesc'
                    | translate
                      : {
                          Default: 'Browse managed sandbox services and attach page elements.'
                        }
                }}
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-xl border border-divider-regular px-3 py-2 text-sm text-text-secondary transition hover:text-text-primary"
                (click)="refreshServices()"
              >
                <i class="ri-refresh-line text-base"></i>
                <span>{{ 'PAC.KEY_WORDS.Refresh' | translate: { Default: 'Refresh' } }}</span>
              </button>

              <button
                type="button"
                class="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition"
                [ngClass]="
                  mode() === 'inspect'
                    ? 'border-text-accent text-text-accent'
                    : 'border-divider-regular text-text-secondary hover:text-text-primary'
                "
                (click)="toggleInspectMode()"
              >
                <i class="ri-focus-3-line text-base"></i>
                <span>{{ 'PAC.Chat.ClawXpert.Inspect' | translate: { Default: 'Inspect' } }}</span>
              </button>
            </div>
          </div>

          @if (!loading() && !error() && services().length) {
            <div class="flex flex-wrap items-center gap-2.5">
              <div class="flex min-w-[16rem] flex-1 items-center gap-2">
                <span class="shrink-0 text-[11px] uppercase tracking-[0.16em] text-text-tertiary">
                  {{ 'PAC.Chat.ClawXpert.Service' | translate: { Default: 'Service' } }}
                </span>

                <label class="min-w-0 flex-1">
                  <select
                    class="w-full rounded-xl border border-divider-regular bg-components-card-bg px-3 py-2 text-sm text-text-primary outline-none"
                    [value]="selectedServiceId() ?? ''"
                    (change)="handleServiceSelection($event)"
                  >
                    @for (service of services(); track service.id) {
                      <option [value]="service.id">
                        {{ service.name }} - {{ service.status }}
                      </option>
                    }
                  </select>
                </label>
              </div>

              @if (selectedService(); as service) {
                <div
                  class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium"
                  [ngClass]="statusClasses(service.status)"
                >
                  <span class="h-2 w-2 rounded-full bg-current"></span>
                  <span>{{ service.status }}</span>
                </div>

                <div class="min-w-0 max-w-[18rem] text-xs text-text-secondary">
                  @if (service.actualPort) {
                    <span class="whitespace-nowrap">
                      {{ 'PAC.Chat.ClawXpert.Port' | translate: { Default: 'Port' } }} {{ service.actualPort }}
                    </span>
                  } @else {
                    <span class="block truncate">{{ service.workingDirectory }}</span>
                  }
                </div>

                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-xl border border-divider-regular px-3 py-2 text-sm text-text-secondary transition hover:text-text-primary"
                  (click)="restartSelectedService()"
                >
                  <i class="ri-restart-line text-base"></i>
                  <span>{{ 'PAC.KEY_WORDS.Restart' | translate: { Default: 'Restart' } }}</span>
                </button>

                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-xl border border-divider-regular px-3 py-2 text-sm text-text-secondary transition hover:text-text-primary"
                  (click)="stopSelectedService()"
                >
                  <i class="ri-stop-circle-line text-base"></i>
                  <span>{{ 'PAC.KEY_WORDS.Stop' | translate: { Default: 'Stop' } }}</span>
                </button>

                <button
                  type="button"
                  class="inline-flex items-center gap-2 rounded-xl border border-divider-regular px-3 py-2 text-sm text-text-secondary transition hover:text-text-primary"
                  (click)="toggleLogs()"
                >
                  <i class="ri-file-list-3-line text-base"></i>
                  @if (showLogs()) {
                    <span>{{ 'PAC.KEY_WORDS.Hide' | translate: { Default: 'Hide' } }}</span>
                  } @else {
                    <span>{{ 'PAC.KEY_WORDS.Logs' | translate: { Default: 'Logs' } }}</span>
                  }
                </button>
              }
            </div>
          }
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col">
        @if (loading()) {
          <div class="flex min-h-[20rem] flex-1 items-center justify-center px-6 text-sm text-text-secondary">
            {{ 'PAC.Chat.ClawXpert.PreviewLoading' | translate: { Default: 'Loading sandbox services...' } }}
          </div>
        } @else if (error()) {
          <div class="m-4 rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3 text-sm text-text-secondary">
            {{ error() }}
          </div>
        } @else if (!services().length) {
          <div class="flex min-h-[20rem] flex-1 flex-col items-center justify-center px-6 text-center">
            <i class="ri-layout-4-line text-3xl text-text-tertiary"></i>
            <div class="mt-4 text-base font-medium text-text-primary">
              {{ 'PAC.Chat.ClawXpert.PreviewEmptyTitle' | translate: { Default: 'No managed services yet' } }}
            </div>
            <div class="mt-2 max-w-md text-sm text-text-secondary">
              {{
                'PAC.Chat.ClawXpert.PreviewEmptyDesc'
                  | translate
                    : {
                        Default:
                          'Ask ClawXpert to start a sandbox service with sandbox_service_start, then browse it here.'
                      }
              }}
            </div>
          </div>
        } @else {
          @if (selectedService(); as service) {
            @if (service.previewUrl && service.transportMode === 'http') {
              <div class="relative min-h-0 flex-1 overflow-hidden">
                @if (previewSessionLoading()) {
                  <div class="flex h-full min-h-[20rem] items-center justify-center px-6 text-sm text-text-secondary">
                    {{
                      'PAC.Chat.ClawXpert.PreviewAuthorizing'
                        | translate: { Default: 'Authorizing sandbox browser...' }
                    }}
                  </div>
                } @else if (previewSessionError()) {
                  <div class="m-4 rounded-2xl border border-divider-regular bg-background-default-subtle px-4 py-3 text-sm text-text-secondary">
                    {{ previewSessionError() }}
                  </div>
                } @else if (previewResourceUrl()) {
                  <iframe
                    #previewFrame
                    class="h-full w-full bg-background-default-subtle"
                    [src]="previewResourceUrl()"
                    (load)="handleFrameLoad()"
                  ></iframe>
                } @else {
                  <div class="flex h-full min-h-[20rem] items-center justify-center px-6 text-sm text-text-secondary">
                    {{ 'PAC.Chat.ClawXpert.PreviewPending' | translate: { Default: 'Preparing sandbox browser...' } }}
                  </div>
                }

                @if (activeOverlay(); as overlay) {
                  <div class="pointer-events-none absolute inset-0">
                    <div
                      class="absolute border-2 border-text-accent bg-components-card-bg/10"
                      [style.height.px]="overlay.height"
                      [style.left.px]="overlay.left"
                      [style.top.px]="overlay.top"
                      [style.width.px]="overlay.width"
                    ></div>
                    <div
                      class="absolute max-w-[20rem] rounded-md border border-text-accent bg-components-card-bg px-2 py-1 text-xs text-text-accent shadow-sm"
                      [style.left.px]="overlay.left"
                      [style.top.px]="overlay.top > 30 ? overlay.top - 30 : overlay.top + 6"
                    >
                      {{ overlay.label }}
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="flex min-h-[20rem] flex-1 flex-col items-center justify-center px-6 text-center">
                <i class="ri-terminal-box-line text-3xl text-text-tertiary"></i>
                <div class="mt-4 text-base font-medium text-text-primary">
                  {{ 'PAC.Chat.ClawXpert.PreviewUnavailableTitle' | translate: { Default: 'Browser unavailable' } }}
                </div>
                <div class="mt-2 max-w-md text-sm text-text-secondary">
                  {{
                    'PAC.Chat.ClawXpert.PreviewUnavailableDesc'
                      | translate
                        : {
                            Default:
                              'This managed service is not currently available in the browser. You can still inspect logs or restart it.'
                          }
                  }}
                </div>
              </div>
            }

            @if (showLogs()) {
              <div class="grid max-h-[18rem] grid-cols-1 gap-3 border-t border-divider-regular px-4 py-3 lg:grid-cols-2">
                <div class="min-h-0 overflow-hidden rounded-2xl border border-divider-regular bg-background-default-subtle">
                  <div class="border-b border-divider-regular px-3 py-2 text-xs uppercase tracking-[0.16em] text-text-tertiary">
                    {{ 'PAC.Chat.ClawXpert.Stdout' | translate: { Default: 'Stdout' } }}
                  </div>
                  <pre class="max-h-[14rem] overflow-auto px-3 py-3 text-xs text-text-secondary">{{ logs()?.stdout || '' }}</pre>
                </div>

                <div class="min-h-0 overflow-hidden rounded-2xl border border-divider-regular bg-background-default-subtle">
                  <div class="border-b border-divider-regular px-3 py-2 text-xs uppercase tracking-[0.16em] text-text-tertiary">
                    {{ 'PAC.Chat.ClawXpert.Stderr' | translate: { Default: 'Stderr' } }}
                  </div>
                  <pre class="max-h-[14rem] overflow-auto px-3 py-3 text-xs text-text-secondary">{{ logs()?.stderr || '' }}</pre>
                </div>
              </div>
            }
          }
        }
      </div>
    </div>
  `
})
export class ClawXpertConversationPreviewComponent implements OnDestroy {
  readonly #sandboxService = inject(SandboxService)
  readonly #sanitizer = inject(DomSanitizer)
  readonly #toastr = injectToastr()
  #frameCleanup: (() => void) | null = null
  #frameSyncRequestId: number | null = null
  #frameSyncWindow: Window | null = null
  #hoveredTarget: PreviewOverlayTarget | null = null
  #selectedTarget: PreviewOverlayTarget | null = null

  readonly conversationId = input<string | null>(null)
  readonly referenceRequest = output<TChatElementReference>()
  readonly frameRef = viewChild<ElementRef<HTMLIFrameElement>>('previewFrame')

  readonly services = signal<ISandboxManagedService[]>([])
  readonly selectedServiceId = signal<string | null>(null)
  readonly logs = signal<TSandboxManagedServiceLogs | null>(null)
  readonly loading = signal(false)
  readonly logsLoading = signal(false)
  readonly error = signal<string | null>(null)
  readonly previewSessionError = signal<string | null>(null)
  readonly previewSessionLoading = signal(false)
  readonly mode = signal<'browse' | 'inspect'>('browse')
  readonly showLogs = signal(false)
  readonly hoveredOverlay = signal<PreviewOverlay | null>(null)
  readonly selectedOverlay = signal<PreviewOverlay | null>(null)
  readonly previewSessionKey = signal<string | null>(null)
  readonly previewSessionUrl = signal<string | null>(null)

  readonly selectedService = computed(() => {
    const selectedServiceId = this.selectedServiceId()
    return this.services().find((service) => service.id === selectedServiceId) ?? null
  })
  readonly activeOverlay = computed(() => this.selectedOverlay() ?? this.hoveredOverlay())
  readonly previewResourceUrl = computed<SafeResourceUrl | null>(() => {
    const rawUrl = this.previewSessionUrl()
    return rawUrl ? this.#sanitizer.bypassSecurityTrustResourceUrl(rawUrl) : null
  })

  constructor() {
    effect((onCleanup) => {
      const conversationId = this.conversationId()
      this.resetFrameState()
      this.services.set([])
      this.selectedServiceId.set(null)
      this.logs.set(null)
      this.error.set(null)
      this.previewSessionError.set(null)
      this.previewSessionLoading.set(false)
      this.previewSessionKey.set(null)
      this.previewSessionUrl.set(null)

      if (!conversationId) {
        return
      }

      void this.refreshServices()

      const intervalId = setInterval(() => {
        void this.refreshServices(false)
      }, SERVICE_REFRESH_INTERVAL_MS)

      onCleanup(() => {
        clearInterval(intervalId)
      })
    })

    effect(() => {
      if (!this.showLogs() || !this.selectedServiceId()) {
        return
      }

      void this.refreshLogs()
    })
  }

  ngOnDestroy(): void {
    this.destroyFrameListeners()
  }

  async refreshServices(showLoading = true) {
    const conversationId = this.conversationId()
    if (!conversationId) {
      return
    }

    if (showLoading) {
      this.loading.set(true)
    }

    try {
      const services = await firstValueFrom(this.#sandboxService.listManagedServices(conversationId))
      this.services.set(services)
      this.syncSelectedService(services)
      await this.ensurePreviewSessionForSelectedService()
      this.error.set(null)
    } catch (error) {
      this.error.set(getErrorMessage(error) || 'Failed to load managed sandbox services.')
    } finally {
      if (showLoading) {
        this.loading.set(false)
      }
    }
  }

  selectService(serviceId: string) {
    this.selectedServiceId.set(serviceId || null)
    this.resetFrameState()
    void this.ensurePreviewSessionForSelectedService()
    if (this.showLogs()) {
      void this.refreshLogs()
    }
  }

  handleServiceSelection(event: Event) {
    const target = event.target
    this.selectService(target instanceof HTMLSelectElement ? target.value : '')
  }

  toggleInspectMode() {
    this.mode.update((mode) => (mode === 'inspect' ? 'browse' : 'inspect'))
    if (this.mode() === 'browse') {
      this.resetOverlayTargets()
    }
  }

  toggleLogs() {
    this.showLogs.update((value) => !value)
    if (this.showLogs()) {
      void this.refreshLogs()
    }
  }

  async restartSelectedService() {
    const conversationId = this.conversationId()
    const service = this.selectedService()
    if (!conversationId || !service?.id) {
      return
    }

    try {
      await firstValueFrom(this.#sandboxService.restartManagedService(conversationId, service.id))
      await this.refreshServices(false)
      if (this.showLogs()) {
        await this.refreshLogs()
      }
    } catch (error) {
      this.#toastr.danger(getErrorMessage(error) || 'PAC.Chat.ClawXpert.ServiceRestartFailed')
    }
  }

  async stopSelectedService() {
    const conversationId = this.conversationId()
    const service = this.selectedService()
    if (!conversationId || !service?.id) {
      return
    }

    try {
      await firstValueFrom(this.#sandboxService.stopManagedService(conversationId, service.id))
      await this.refreshServices(false)
      if (this.showLogs()) {
        await this.refreshLogs()
      }
    } catch (error) {
      this.#toastr.danger(getErrorMessage(error) || 'PAC.Chat.ClawXpert.ServiceStopFailed')
    }
  }

  handleFrameLoad() {
    this.destroyFrameListeners()
    this.resetOverlayTargets()
    const iframe = this.frameRef()?.nativeElement
    const service = this.selectedService()
    if (!iframe || !service) {
      return
    }

    const documentRef = iframe.contentDocument
    if (!documentRef) {
      return
    }

    const updateHover = (event: MouseEvent) => {
      const target = readTargetElement(event.target)
      if (this.mode() !== 'inspect') {
        return
      }

      if (!target) {
        this.clearHoveredTarget()
        return
      }

      const overlayTarget = { element: target, service }
      this.#hoveredTarget = overlayTarget
      this.hoveredOverlay.set(this.buildOverlayForTarget(overlayTarget))
      this.ensureOverlaySyncLoop(documentRef.defaultView)
    }

    const clearHover = () => {
      this.clearHoveredTarget()
    }

    const selectElement = (event: MouseEvent) => {
      const target = readTargetElement(event.target)
      if (this.mode() !== 'inspect' || !target) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      const overlayTarget = { element: target, service }
      const overlay = this.buildOverlayForTarget(overlayTarget)
      if (!overlay) {
        return
      }

      this.#selectedTarget = overlayTarget
      this.selectedOverlay.set(overlay)
      this.ensureOverlaySyncLoop(documentRef.defaultView)
      this.referenceRequest.emit(overlay.reference)
    }

    const syncOverlays = () => {
      this.refreshTrackedOverlays()
    }
    const frameWindow = documentRef.defaultView

    documentRef.addEventListener('mousemove', updateHover, true)
    documentRef.addEventListener('mouseleave', clearHover, true)
    documentRef.addEventListener('click', selectElement, true)
    documentRef.addEventListener('scroll', syncOverlays, true)
    frameWindow?.addEventListener('scroll', syncOverlays, true)
    frameWindow?.addEventListener('resize', syncOverlays)

    this.#frameCleanup = () => {
      documentRef.removeEventListener('mousemove', updateHover, true)
      documentRef.removeEventListener('mouseleave', clearHover, true)
      documentRef.removeEventListener('click', selectElement, true)
      documentRef.removeEventListener('scroll', syncOverlays, true)
      frameWindow?.removeEventListener('scroll', syncOverlays, true)
      frameWindow?.removeEventListener('resize', syncOverlays)
    }
  }

  statusClasses(status: TSandboxManagedServiceStatus) {
    const classMap: Record<TSandboxManagedServiceStatus, string> = {
      failed: 'border-text-accent text-text-accent',
      lost: 'border-divider-regular text-text-tertiary',
      running: 'border-divider-deep text-text-primary',
      starting: 'border-divider-regular text-text-secondary',
      stopped: 'border-divider-regular text-text-tertiary',
      stopping: 'border-divider-regular text-text-secondary'
    }

    return classMap[status] ?? 'border-divider-regular text-text-secondary'
  }

  private buildOverlay(service: ISandboxManagedService, element: Element): PreviewOverlay | null {
    if (!element.isConnected) {
      return null
    }

    const reference = buildElementReference(service, element)
    if (!reference) {
      return null
    }

    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }

    return {
      height: rect.height,
      label: reference.label || `${reference.tagName} ${reference.selector}`,
      left: rect.left,
      reference,
      top: rect.top,
      width: rect.width
    }
  }

  private buildOverlayForTarget(target: PreviewOverlayTarget | null) {
    return target ? this.buildOverlay(target.service, target.element) : null
  }

  private clearHoveredTarget() {
    this.#hoveredTarget = null
    this.hoveredOverlay.set(null)
    this.stopOverlaySyncLoopIfIdle()
  }

  private destroyFrameListeners() {
    this.#frameCleanup?.()
    this.#frameCleanup = null
    this.stopOverlaySyncLoop()
  }

  private ensureOverlaySyncLoop(frameWindow: Window | null) {
    if (!frameWindow) {
      return
    }

    this.#frameSyncWindow = frameWindow
    if (this.#frameSyncRequestId !== null) {
      return
    }

    const tick = () => {
      this.#frameSyncRequestId = null
      this.refreshTrackedOverlays()

      if (!this.#hoveredTarget && !this.#selectedTarget) {
        this.#frameSyncWindow = null
        return
      }

      this.#frameSyncRequestId = frameWindow.requestAnimationFrame(tick)
    }

    this.#frameSyncRequestId = frameWindow.requestAnimationFrame(tick)
  }

  private refreshTrackedOverlays() {
    const hoveredOverlay = this.buildOverlayForTarget(this.#hoveredTarget)
    if (!hoveredOverlay) {
      this.#hoveredTarget = null
    }
    this.hoveredOverlay.set(hoveredOverlay)

    const selectedOverlay = this.buildOverlayForTarget(this.#selectedTarget)
    if (!selectedOverlay) {
      this.#selectedTarget = null
    }
    this.selectedOverlay.set(selectedOverlay)

    this.stopOverlaySyncLoopIfIdle()
  }

  private resetOverlayTargets() {
    this.#hoveredTarget = null
    this.#selectedTarget = null
    this.hoveredOverlay.set(null)
    this.selectedOverlay.set(null)
    this.stopOverlaySyncLoop()
  }

  private stopOverlaySyncLoop() {
    if (this.#frameSyncRequestId !== null) {
      this.#frameSyncWindow?.cancelAnimationFrame(this.#frameSyncRequestId)
      this.#frameSyncRequestId = null
    }

    this.#frameSyncWindow = null
  }

  private stopOverlaySyncLoopIfIdle() {
    if (!this.#hoveredTarget && !this.#selectedTarget) {
      this.stopOverlaySyncLoop()
    }
  }

  private resetFrameState() {
    this.destroyFrameListeners()
    this.resetOverlayTargets()
  }

  private buildPreviewSessionKey(service: ISandboxManagedService | null): string | null {
    const conversationId = this.conversationId()
    if (!conversationId || !service?.id || !service.previewUrl || service.transportMode !== 'http') {
      return null
    }

    return `${conversationId}:${service.id}:${service.previewUrl}`
  }

  private async refreshLogs() {
    const conversationId = this.conversationId()
    const service = this.selectedService()
    if (!conversationId || !service?.id) {
      this.logs.set(null)
      return
    }

    this.logsLoading.set(true)
    try {
      const logs = await firstValueFrom(this.#sandboxService.getManagedServiceLogs(conversationId, service.id, 200))
      this.logs.set(logs)
    } catch (error) {
      this.#toastr.danger(getErrorMessage(error) || 'PAC.Chat.ClawXpert.ServiceLogsFailed')
    } finally {
      this.logsLoading.set(false)
    }
  }

  private async ensurePreviewSessionForSelectedService() {
    const conversationId = this.conversationId()
    const service = this.selectedService()
    const nextKey = this.buildPreviewSessionKey(service)

    if (!conversationId || !service?.id || !nextKey) {
      this.previewSessionError.set(null)
      this.previewSessionLoading.set(false)
      this.previewSessionKey.set(null)
      this.previewSessionUrl.set(null)
      return
    }

    if (this.previewSessionKey() === nextKey && this.previewSessionUrl()) {
      return
    }

    this.previewSessionError.set(null)
    this.previewSessionLoading.set(true)
    this.previewSessionKey.set(null)
    this.previewSessionUrl.set(null)

    try {
      const session = await firstValueFrom(
        this.#sandboxService.createManagedServicePreviewSession(conversationId, service.id)
      )
      if (this.buildPreviewSessionKey(this.selectedService()) !== nextKey) {
        return
      }

      this.previewSessionKey.set(nextKey)
      this.previewSessionUrl.set(session.previewUrl)
    } catch (error) {
      if (this.buildPreviewSessionKey(this.selectedService()) !== nextKey) {
        return
      }

      this.previewSessionError.set(getErrorMessage(error) || 'Failed to authorize sandbox preview.')
    } finally {
      if (this.buildPreviewSessionKey(this.selectedService()) === nextKey) {
        this.previewSessionLoading.set(false)
      }
    }
  }

  private syncSelectedService(services: ISandboxManagedService[]) {
    const currentId = this.selectedServiceId()
    if (currentId && services.some((service) => service.id === currentId)) {
      return
    }

    const preferred =
      services.find((service) => service.status === 'running' && service.previewUrl) ??
      services.find((service) => service.previewUrl) ??
      services[0] ??
      null

    this.selectedServiceId.set(preferred?.id ?? null)
  }
}
