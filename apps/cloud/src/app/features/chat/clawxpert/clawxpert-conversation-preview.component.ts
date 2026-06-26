import { CommonModule, DOCUMENT } from '@angular/common'
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
import { FormsModule } from '@angular/forms'
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser'
import { environment } from '@cloud/environments/environment'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardInputDirective, ZardMenuImports } from '@xpert-ai/headless-ui'
import { TChatElementReference } from '@xpert-ai/contracts'
import { injectToastr, resolveAbsoluteApiBaseUrl } from '../../../@core'
import {
  createClawXpertManagedServicesBrowserController,
  type ClawXpertManagedServicesBrowserControllerOptions,
  type ClawXpertManagedServicesSandboxApi
} from './clawxpert-managed-services-browser'

type PreviewOverlay = {
  height: number
  label: string
  left: number
  reference: TChatElementReference
  top: number
  width: number
}

type PreviewOverlayTarget = {
  context: ElementReferenceContext
  element: Element
  reference: TChatElementReference
}

export type ClawXpertBrowserStateChange = {
  deviceToolbarVisible?: boolean
  displayUrl?: string | null
  reloadKey?: number
  serviceId?: string | null
  url?: string | null
  zoom?: number
}

const DEFAULT_ZOOM_LEVEL = 100
const ZOOM_STEP = 10
const MIN_ZOOM_LEVEL = 50
const MAX_ZOOM_LEVEL = 200
const DEFAULT_DEVICE_VIEWPORT_WIDTH = 405
const DEFAULT_DEVICE_VIEWPORT_HEIGHT = 506
const MIN_DEVICE_VIEWPORT_SIZE = 120
const MAX_DEVICE_VIEWPORT_SIZE = 2000
const LOCAL_SERVICE_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])
const RESPONSIVE_DEVICE_PRESET_ID = 'responsive'

type DeviceViewportResizeHandle = 'left' | 'bottom' | 'corner'
type DeviceViewportPreset = {
  defaultLabel: string
  height: number
  id: string
  labelKey: string
  width: number
}
type DeviceViewportPointer = {
  x: number
  y: number
}

const DEVICE_VIEWPORT_PRESETS: readonly DeviceViewportPreset[] = [
  {
    id: RESPONSIVE_DEVICE_PRESET_ID,
    labelKey: 'PAC.Chat.ClawXpert.Responsive',
    defaultLabel: 'Responsive',
    width: DEFAULT_DEVICE_VIEWPORT_WIDTH,
    height: DEFAULT_DEVICE_VIEWPORT_HEIGHT
  },
  { id: '4k', labelKey: 'PAC.Chat.ClawXpert.DevicePreset4K', defaultLabel: '4K', width: 3840, height: 2160 },
  {
    id: 'laptop-l',
    labelKey: 'PAC.Chat.ClawXpert.DevicePresetLaptopL',
    defaultLabel: 'Laptop L',
    width: 1440,
    height: 900
  },
  {
    id: 'laptop',
    labelKey: 'PAC.Chat.ClawXpert.DevicePresetLaptop',
    defaultLabel: 'Laptop',
    width: 1280,
    height: 800
  },
  {
    id: 'surface-pro-7',
    labelKey: 'PAC.Chat.ClawXpert.DevicePresetSurfacePro7',
    defaultLabel: 'Surface Pro 7',
    width: 912,
    height: 1368
  },
  {
    id: 'ipad-air',
    labelKey: 'PAC.Chat.ClawXpert.DevicePresetIPadAir',
    defaultLabel: 'iPad Air',
    width: 820,
    height: 1180
  },
  {
    id: 'ipad-mini',
    labelKey: 'PAC.Chat.ClawXpert.DevicePresetIPadMini',
    defaultLabel: 'iPad Mini',
    width: 768,
    height: 1024
  },
  {
    id: 'surface-duo',
    labelKey: 'PAC.Chat.ClawXpert.DevicePresetSurfaceDuo',
    defaultLabel: 'Surface Duo',
    width: 540,
    height: 720
  },
  {
    id: 'iphone-15-pro-max',
    labelKey: 'PAC.Chat.ClawXpert.DevicePresetIPhone15ProMax',
    defaultLabel: 'iPhone 15 Pro Max',
    width: 430,
    height: 932
  },
  {
    id: 'pixel-8',
    labelKey: 'PAC.Chat.ClawXpert.DevicePresetPixel8',
    defaultLabel: 'Pixel 8',
    width: 412,
    height: 915
  },
  {
    id: 'iphone-15-pro',
    labelKey: 'PAC.Chat.ClawXpert.DevicePresetIPhone15Pro',
    defaultLabel: 'iPhone 15 Pro',
    width: 393,
    height: 852
  },
  {
    id: 'samsung-galaxy-s24-ultra',
    labelKey: 'PAC.Chat.ClawXpert.DevicePresetSamsungGalaxyS24Ultra',
    defaultLabel: 'Samsung Galaxy S24 Ultra',
    width: 384,
    height: 824
  },
  {
    id: 'iphone-se',
    labelKey: 'PAC.Chat.ClawXpert.DevicePresetIPhoneSE',
    defaultLabel: 'iPhone SE',
    width: 375,
    height: 667
  }
]

type BrowserNavigationOptions = {
  emitState?: boolean
  pushHistory?: boolean
}

type ElementReferenceContext = {
  pageUrl?: string
  serviceId: string
}

function sameOriginApiProxyUrl(rawUrl: string, apiBaseUrl: string): string {
  if (!rawUrl || !apiBaseUrl) {
    return rawUrl
  }

  try {
    const url = new URL(rawUrl)
    const apiUrl = new URL(apiBaseUrl)
    const browserOrigin = globalThis.location?.origin
    if (
      url.origin === apiUrl.origin &&
      url.pathname.startsWith('/api/') &&
      browserOrigin &&
      url.origin !== browserOrigin
    ) {
      return `${url.pathname}${url.search}${url.hash}`
    }
  } catch {
    return rawUrl
  }

  return rawUrl
}

function clampZoomLevel(value: number | null | undefined) {
  const nextValue = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_ZOOM_LEVEL
  return Math.min(MAX_ZOOM_LEVEL, Math.max(MIN_ZOOM_LEVEL, Math.round(nextValue)))
}

function clampDeviceViewportSize(value: unknown, fallback: number) {
  const numericValue =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : fallback
  const nextValue = Number.isFinite(numericValue) ? numericValue : fallback
  return Math.min(MAX_DEVICE_VIEWPORT_SIZE, Math.max(MIN_DEVICE_VIEWPORT_SIZE, Math.round(nextValue)))
}

function hasUrlScheme(value: string) {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value)
}

function normalizeAddressUrl(rawValue: string): string | null {
  const value = rawValue.trim()
  if (!value) {
    return null
  }

  const normalizedValue = hasUrlScheme(value)
    ? value
    : LOCAL_SERVICE_HOSTS.has(value.split(/[/:]/)[0] ?? '')
      ? `http://${value}`
      : `https://${value}`

  try {
    return new URL(normalizedValue).toString()
  } catch {
    return null
  }
}

function formatBrowserDisplayUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    const host = url.port ? `${url.hostname}:${url.port}` : url.hostname
    const path = `${url.pathname}${url.search}${url.hash}`
    if (LOCAL_SERVICE_HOSTS.has(url.hostname)) {
      return path === '/' ? host : `${host}${path}`
    }

    return url.toString()
  } catch {
    return rawUrl
  }
}

function appendBrowserCacheKey(rawUrl: string, reloadNonce: number, cacheBustNonce: number): string {
  if (!reloadNonce && !cacheBustNonce) {
    return rawUrl
  }

  try {
    const url = new URL(rawUrl)
    if (reloadNonce) {
      url.searchParams.set('__clawxpert_reload', String(reloadNonce))
    }
    if (cacheBustNonce) {
      url.searchParams.set('__clawxpert_cache', String(cacheBustNonce))
    }

    return url.toString()
  } catch {
    const params = new URLSearchParams()
    if (reloadNonce) {
      params.set('__clawxpert_reload', String(reloadNonce))
    }
    if (cacheBustNonce) {
      params.set('__clawxpert_cache', String(cacheBustNonce))
    }

    const separator = rawUrl.includes('?') ? '&' : '?'
    return `${rawUrl}${separator}${params.toString()}`
  }
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function readTargetElement(value: EventTarget | null): Element | null {
  if (!value || typeof value !== 'object' || !('nodeType' in value) || value.nodeType !== 1) {
    return null
  }

  return value as Element
}

function ignoreBlockedFrameAccess(callback: () => void) {
  try {
    callback()
  } catch {
    // A preview iframe can navigate cross-origin before Angular destroys the component.
  }
}

function safelyAddFrameWindowEventListener(
  frameWindow: Window | null,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions
) {
  ignoreBlockedFrameAccess(() => {
    frameWindow?.addEventListener(type, listener, options)
  })
}

function safelyRemoveFrameWindowEventListener(
  frameWindow: Window | null,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions
) {
  ignoreBlockedFrameAccess(() => {
    frameWindow?.removeEventListener(type, listener, options)
  })
}

function safelyRequestFrameAnimationFrame(frameWindow: Window | null, callback: FrameRequestCallback): number | null {
  let requestId: number | null = null

  ignoreBlockedFrameAccess(() => {
    requestId = frameWindow?.requestAnimationFrame(callback) ?? null
  })

  return requestId
}

function safelyCancelFrameAnimationFrame(frameWindow: Window | null, requestId: number) {
  ignoreBlockedFrameAccess(() => {
    frameWindow?.cancelAnimationFrame(requestId)
  })
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

function buildElementReference(context: ElementReferenceContext, element: Element): TChatElementReference | null {
  if (!context.serviceId) {
    return null
  }

  const documentRef = element.ownerDocument
  const pageUrl = context.pageUrl ?? documentRef.location?.href
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
    serviceId: context.serviceId,
    tagName: element.tagName.toLowerCase(),
    text: truncateValue(text || element.tagName.toLowerCase(), 1000),
    type: 'element'
  }
}

@Component({
  standalone: true,
  selector: 'pac-clawxpert-conversation-preview',
  imports: [CommonModule, FormsModule, TranslateModule, ZardButtonComponent, ZardInputDirective, ...ZardMenuImports],
  template: `
    <div
      class="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-divider-regular bg-components-card-bg"
    >
      <div class="border-b border-divider-regular px-2 py-1.5">
        <div class="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            data-browser-back
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors enabled:hover:bg-hover-bg enabled:hover:text-text-primary disabled:text-text-quaternary"
            [disabled]="!canGoBack()"
            (click)="goBack()"
          >
            <i class="ri-arrow-left-line text-lg"></i>
          </button>
          <button
            type="button"
            data-browser-forward
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors enabled:hover:bg-hover-bg enabled:hover:text-text-primary disabled:text-text-quaternary"
            [disabled]="!canGoForward()"
            (click)="goForward()"
          >
            <i class="ri-arrow-right-line text-lg"></i>
          </button>
          <button
            type="button"
            data-browser-refresh
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
            (click)="reloadFrame()"
          >
            <i class="ri-refresh-line text-lg"></i>
          </button>

          <form class="flex min-w-0 flex-1 items-center" (submit)="navigateFromAddressEvent($event)">
            <label class="relative flex min-w-0 flex-1 items-center">
              <input
                z-input
                data-browser-address
                name="browserAddress"
                class="h-8 w-full rounded-xl border-divider-regular bg-components-card-bg pl-3 pr-8 text-center text-sm text-text-primary"
                [ngModel]="addressValue()"
                (ngModelChange)="addressValue.set($event)"
                [placeholder]="'PAC.Chat.ClawXpert.EnterUrl' | translate: { Default: 'Enter URL' }"
              />
              <button
                type="submit"
                class="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
              >
                <i class="ri-arrow-right-up-line text-base"></i>
              </button>
            </label>
          </form>

          <button
            type="button"
            data-browser-inspect
            [class]="
              mode() === 'inspect'
                ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-accent transition-colors hover:bg-hover-bg'
                : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary'
            "
            (click)="toggleInspectMode()"
          >
            <i class="ri-focus-3-line text-lg"></i>
          </button>

          <button
            type="button"
            data-open-external
            class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors enabled:hover:bg-hover-bg enabled:hover:text-text-primary disabled:text-text-quaternary"
            [disabled]="!openableUrl()"
            (click)="openExternal()"
          >
            <i class="ri-external-link-line text-lg"></i>
          </button>

          <button
            z-button
            type="button"
            zType="ghost"
            zSize="icon"
            data-browser-menu
            class="h-8 w-8 rounded-lg text-text-secondary hover:text-text-primary"
            z-menu
            [zMenuTriggerFor]="browserMenu"
          >
            <i class="ri-more-2-fill text-lg"></i>
          </button>
        </div>

        @if (deviceToolbar()) {
          <div
            data-device-toolbar
            class="mt-2 flex h-12 items-center gap-2 border-t border-divider-regular bg-background-default-subtle px-3 text-sm text-text-secondary"
          >
            <button
              type="button"
              data-device-preset-trigger
              class="flex h-8 min-w-32 items-center justify-between gap-1 rounded-lg px-2 transition-colors hover:bg-hover-bg hover:text-text-primary"
              z-menu
              [zMenuTriggerFor]="devicePresetMenu"
            >
              <span>{{
                selectedDevicePresetLabelKey() | translate: { Default: selectedDevicePresetDefaultLabel() }
              }}</span>
              <i class="ri-arrow-down-s-line text-base"></i>
            </button>
            <input
              z-input
              type="number"
              inputmode="numeric"
              name="deviceViewportWidth"
              data-device-width
              class="h-8 w-20 rounded-xl border-divider-regular bg-components-card-bg text-center text-sm text-text-primary"
              [attr.aria-label]="'PAC.Chat.ClawXpert.DeviceWidth' | translate: { Default: 'Device width' }"
              [value]="deviceViewportWidthText()"
              (input)="setDeviceViewportWidthFromEvent($event)"
            />
            <span class="text-text-tertiary">x</span>
            <input
              z-input
              type="number"
              inputmode="numeric"
              name="deviceViewportHeight"
              data-device-height
              class="h-8 w-20 rounded-xl border-divider-regular bg-components-card-bg text-center text-sm text-text-primary"
              [attr.aria-label]="'PAC.Chat.ClawXpert.DeviceHeight' | translate: { Default: 'Device height' }"
              [value]="deviceViewportHeightText()"
              (input)="setDeviceViewportHeightFromEvent($event)"
            />
            <button
              type="button"
              data-device-rotate
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
              [title]="'PAC.Chat.ClawXpert.RotateDevice' | translate: { Default: 'Rotate device' }"
              (click)="rotateDeviceViewport()"
            >
              <i class="ri-anticlockwise-2-line text-lg"></i>
            </button>
            <button
              type="button"
              data-device-toolbar-close
              class="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
              [title]="'PAC.Chat.ClawXpert.CloseDeviceToolbar' | translate: { Default: 'Close device toolbar' }"
              (click)="closeDeviceToolbar()"
            >
              <i class="ri-close-line text-xl"></i>
            </button>
          </div>
        }
      </div>

      <div class="flex min-h-0 flex-1 flex-col">
        @if (hasBrowserTarget()) {
          <div class="relative min-h-0 flex-1 overflow-hidden">
            <div
              data-browser-viewport
              [class]="
                deviceToolbar()
                  ? 'flex h-full w-full items-start justify-center overflow-auto bg-background-default-subtle p-6'
                  : 'h-full w-full overflow-auto bg-background-default-subtle'
              "
            >
              <div
                [class]="
                  deviceToolbar()
                    ? 'relative shrink-0 overflow-visible bg-text-primary/80 pb-10 pl-10 shadow-sm'
                    : 'h-full w-full'
                "
              >
                @if (deviceToolbar()) {
                  <button
                    type="button"
                    data-device-resize-width
                    class="absolute bottom-10 left-0 top-0 flex w-10 cursor-ew-resize items-center justify-center text-components-card-bg/70 transition-colors hover:text-components-card-bg"
                    (mousedown)="startDeviceViewportResize($event, 'left')"
                    (touchstart)="startDeviceViewportResize($event, 'left')"
                  >
                    <span class="h-12 w-1 rounded-full bg-current"></span>
                  </button>
                }

                <div
                  [attr.data-device-viewport]="deviceToolbar() ? '' : null"
                  [class]="deviceToolbar() ? 'overflow-hidden bg-components-card-bg' : 'h-full w-full'"
                  [style.width.px]="deviceToolbar() ? deviceViewportWidth() : null"
                  [style.height.px]="deviceToolbar() ? deviceViewportHeight() : null"
                >
                  <iframe
                    #previewFrame
                    class="origin-top-left min-h-full bg-background-default-subtle"
                    [class.h-full]="zoomLevel() === 100"
                    [class.w-full]="zoomLevel() === 100"
                    [style.height.%]="framePercentSize()"
                    [style.width.%]="framePercentSize()"
                    [style.transform]="frameTransform()"
                    [src]="browserResourceUrl()"
                    (load)="handleFrameLoad()"
                  ></iframe>
                </div>

                @if (deviceToolbar()) {
                  <button
                    type="button"
                    data-device-resize-corner
                    class="absolute bottom-0 left-0 flex h-10 w-10 cursor-nesw-resize items-center justify-center text-components-card-bg/70 transition-colors hover:text-components-card-bg"
                    (mousedown)="startDeviceViewportResize($event, 'corner')"
                    (touchstart)="startDeviceViewportResize($event, 'corner')"
                  >
                    <i class="ri-drag-move-2-line text-lg"></i>
                  </button>
                  <button
                    type="button"
                    data-device-resize-height
                    class="absolute bottom-0 left-10 right-0 flex h-10 cursor-ns-resize items-center justify-center text-components-card-bg/70 transition-colors hover:text-components-card-bg"
                    (mousedown)="startDeviceViewportResize($event, 'bottom')"
                    (touchstart)="startDeviceViewportResize($event, 'bottom')"
                  >
                    <span class="h-1 w-16 rounded-full bg-current"></span>
                  </button>
                }
              </div>
            </div>

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
            <i class="ri-layout-4-line text-3xl text-text-tertiary"></i>
            <div class="mt-4 text-base font-medium text-text-primary">
              {{ 'PAC.Chat.ClawXpert.BrowserEmptyTitle' | translate: { Default: 'No URL open' } }}
            </div>
            <div class="mt-2 max-w-md text-sm text-text-secondary">
              {{
                'PAC.Chat.ClawXpert.BrowserEmptyDesc'
                  | translate
                    : {
                        Default: 'Enter a URL in the address bar or open a preview event to browse it here.'
                      }
              }}
            </div>
          </div>
        }
      </div>
    </div>

    <ng-template #browserMenu>
      <div z-menu-content class="w-64">
        <button type="button" z-menu-item (click)="forceReload()">
          {{ 'PAC.Chat.ClawXpert.ForceReload' | translate: { Default: 'Force reload' } }}
        </button>
        <button type="button" z-menu-item (click)="toggleDeviceToolbar()">
          @if (deviceToolbar()) {
            {{ 'PAC.Chat.ClawXpert.HideDeviceToolbar' | translate: { Default: 'Hide device toolbar' } }}
          } @else {
            {{ 'PAC.Chat.ClawXpert.ShowDeviceToolbar' | translate: { Default: 'Show device toolbar' } }}
          }
        </button>
        <div
          class="flex items-center justify-between border-y border-divider-regular px-3 py-2 text-sm text-text-secondary"
        >
          <span>{{ 'PAC.Chat.ClawXpert.Zoom' | translate: { Default: 'Zoom' } }}</span>
          <div class="flex items-center rounded-lg border border-divider-regular">
            <button type="button" class="h-8 w-8" (click)="zoomOut()">-</button>
            <span class="min-w-14 text-center">{{ zoomLevel() }}%</span>
            <button type="button" class="h-8 w-8" (click)="zoomIn()">+</button>
          </div>
        </div>
        <button type="button" z-menu-item (click)="clearCookies()">
          {{ 'PAC.Chat.ClawXpert.ClearCookie' | translate: { Default: 'Clear Cookie' } }}
        </button>
        <button type="button" z-menu-item (click)="clearCache()">
          {{ 'PAC.Chat.ClawXpert.ClearCache' | translate: { Default: 'Clear cache' } }}
        </button>
      </div>
    </ng-template>

    <ng-template #devicePresetMenu>
      <div z-menu-content class="w-72">
        @for (preset of deviceViewportPresets; track preset.id) {
          <button
            type="button"
            z-menu-item
            [attr.data-device-preset]="preset.id"
            (click)="applyDeviceViewportPreset(preset.id)"
          >
            <span class="flex items-center gap-2">
              @if (selectedDevicePresetId() === preset.id) {
                <i class="ri-check-line text-base"></i>
              } @else {
                <span class="w-4"></span>
              }
              <span>{{ preset.labelKey | translate: { Default: preset.defaultLabel } }}</span>
            </span>
          </button>
        }
      </div>
    </ng-template>
  `
})
export class ClawXpertConversationPreviewComponent implements OnDestroy {
  readonly #sanitizer = inject(DomSanitizer)
  readonly #apiBaseUrl = resolveAbsoluteApiBaseUrl(environment.API_BASE_URL)
  readonly #toastr = injectToastr()
  readonly #document = inject(DOCUMENT)
  #frameCleanup: (() => void) | null = null
  #frameSyncRequestId: number | null = null
  #frameSyncWindow: Window | null = null
  #hoveredTarget: PreviewOverlayTarget | null = null
  #selectedTarget: PreviewOverlayTarget | null = null
  #deviceViewportResizeCleanup: (() => void) | null = null

  readonly conversationId = input<string | null>(null)
  readonly serviceId = input<string | null | undefined>(null)
  readonly url = input<string | null | undefined>(null)
  readonly zoom = input<number | null | undefined>(DEFAULT_ZOOM_LEVEL)
  readonly deviceToolbarVisible = input<boolean | null | undefined>(false)
  readonly reloadKey = input<number | null | undefined>(0)
  readonly referenceRequest = output<TChatElementReference>()
  readonly browserStateChange = output<ClawXpertBrowserStateChange>()
  readonly frameRef = viewChild<ElementRef<HTMLIFrameElement>>('previewFrame')

  readonly addressValue = signal('')
  readonly displayUrl = signal<string | null>(null)
  readonly externalUrl = signal<string | null>(null)
  readonly zoomLevel = signal(DEFAULT_ZOOM_LEVEL)
  readonly deviceToolbar = signal(false)
  readonly deviceViewportWidth = signal(DEFAULT_DEVICE_VIEWPORT_WIDTH)
  readonly deviceViewportHeight = signal(DEFAULT_DEVICE_VIEWPORT_HEIGHT)
  readonly selectedDevicePresetId = signal(RESPONSIVE_DEVICE_PRESET_ID)
  readonly deviceViewportWidthText = computed(() => String(this.deviceViewportWidth()))
  readonly deviceViewportHeightText = computed(() => String(this.deviceViewportHeight()))
  readonly deviceViewportPresets = DEVICE_VIEWPORT_PRESETS
  readonly reloadNonce = signal(0)
  readonly cacheBustNonce = signal(0)
  readonly history = signal<string[]>([])
  readonly historyIndex = signal(-1)
  readonly mode = signal<'browse' | 'inspect'>('browse')
  readonly hoveredOverlay = signal<PreviewOverlay | null>(null)
  readonly selectedOverlay = signal<PreviewOverlay | null>(null)

  readonly selectedDevicePreset = computed(() => {
    const selectedDevicePresetId = this.selectedDevicePresetId()
    return (
      this.deviceViewportPresets.find((preset) => preset.id === selectedDevicePresetId) ?? this.deviceViewportPresets[0]
    )
  })
  readonly selectedDevicePresetLabelKey = computed(
    () => this.selectedDevicePreset()?.labelKey ?? 'PAC.Chat.ClawXpert.Responsive'
  )
  readonly selectedDevicePresetDefaultLabel = computed(() => this.selectedDevicePreset()?.defaultLabel ?? 'Responsive')
  readonly activeOverlay = computed(() => this.selectedOverlay() ?? this.hoveredOverlay())
  readonly hasBrowserTarget = computed(() => !!this.externalUrl())
  readonly canGoBack = computed(() => this.historyIndex() > 0)
  readonly canGoForward = computed(() => this.historyIndex() >= 0 && this.historyIndex() < this.history().length - 1)
  readonly framePercentSize = computed(() => 100 / (this.zoomLevel() / 100))
  readonly frameTransform = computed(() => `scale(${this.zoomLevel() / 100})`)
  readonly externalResourceUrl = computed<SafeResourceUrl | null>(() => {
    const externalUrl = this.externalUrl()
    const browserUrl = externalUrl ? sameOriginApiProxyUrl(externalUrl, this.#apiBaseUrl) : null
    const previewUrl = browserUrl ? appendBrowserCacheKey(browserUrl, this.reloadNonce(), this.cacheBustNonce()) : null
    return previewUrl ? this.#sanitizer.bypassSecurityTrustResourceUrl(previewUrl) : null
  })
  readonly browserResourceUrl = computed(() => this.externalResourceUrl())
  readonly openableUrl = computed(() => this.externalUrl())

  constructor() {
    effect(() => {
      this.conversationId()
      this.resetFrameState()
      this.externalUrl.set(null)
      this.displayUrl.set(null)
      this.addressValue.set('')
      this.history.set([])
      this.historyIndex.set(-1)
    })

    effect(() => {
      this.zoomLevel.set(clampZoomLevel(this.zoom()))
    })

    effect(() => {
      this.deviceToolbar.set(this.deviceToolbarVisible() === true)
    })

    effect(() => {
      const reloadKey = this.reloadKey()
      const nextReloadKey = typeof reloadKey === 'number' && Number.isFinite(reloadKey) ? reloadKey : 0
      if (this.reloadNonce() !== nextReloadKey) {
        this.reloadNonce.set(nextReloadKey)
      }
    })

    effect(() => {
      this.conversationId()
      const url = this.url()
      this.serviceId()

      if (isNonEmptyString(url)) {
        void this.navigateToAddress(url, {
          emitState: false,
          pushHistory: false
        })
      }
    })
  }

  ngOnDestroy(): void {
    this.stopDeviceViewportResize()
    this.destroyFrameListeners()
  }

  createManagedServicesBrowserController(
    sandboxService: ClawXpertManagedServicesSandboxApi,
    options: Omit<ClawXpertManagedServicesBrowserControllerOptions, 'conversationId'> = {}
  ) {
    return createClawXpertManagedServicesBrowserController(sandboxService, {
      conversationId: this.conversationId(),
      ...options
    })
  }

  async navigateFromAddressEvent(event: Event) {
    event.preventDefault()
    await this.navigateToAddress(this.addressValue())
  }

  async navigateToAddress(rawAddress: string, options: BrowserNavigationOptions = {}) {
    const address = rawAddress.trim()
    if (!address) {
      this.externalUrl.set(null)
      this.displayUrl.set(null)
      this.addressValue.set('')
      this.resetFrameState()
      this.emitBrowserStateIfRequested(options)
      return
    }

    const normalizedUrl = normalizeAddressUrl(address)
    if (!normalizedUrl) {
      this.#toastr.warning('PAC.Chat.ClawXpert.InvalidUrl', {
        Default: 'Enter a valid URL.'
      })
      return
    }

    const nextDisplayUrl = formatBrowserDisplayUrl(normalizedUrl)
    if (this.externalUrl() === normalizedUrl) {
      this.displayUrl.set(nextDisplayUrl)
      this.addressValue.set(nextDisplayUrl)
      this.pushBrowserHistoryIfRequested(nextDisplayUrl, options)
      this.emitBrowserStateIfRequested(options)
      return
    }

    this.externalUrl.set(normalizedUrl)
    this.displayUrl.set(nextDisplayUrl)
    this.addressValue.set(nextDisplayUrl)
    this.resetFrameState()
    this.pushBrowserHistoryIfRequested(nextDisplayUrl, options)
    this.emitBrowserStateIfRequested(options)
  }

  goBack() {
    const history = this.history()
    const index = this.historyIndex()
    if (index <= 0) {
      return
    }

    const nextAddress = history[index - 1]
    this.historyIndex.set(index - 1)
    void this.navigateToAddress(nextAddress, {
      pushHistory: false
    })
  }

  goForward() {
    const history = this.history()
    const index = this.historyIndex()
    if (index < 0 || index >= history.length - 1) {
      return
    }

    const nextAddress = history[index + 1]
    this.historyIndex.set(index + 1)
    void this.navigateToAddress(nextAddress, {
      pushHistory: false
    })
  }

  reloadFrame() {
    this.reloadNonce.update((value) => value + 1)
    this.resetFrameState()
    this.emitBrowserState()
  }

  forceReload() {
    this.clearCache()
  }

  clearCache() {
    this.cacheBustNonce.update((value) => value + 1)
    this.reloadFrame()
  }

  clearCookies() {
    const iframe = this.frameRef()?.nativeElement
    ignoreBlockedFrameAccess(() => {
      const documentRef = iframe?.contentDocument
      if (!documentRef?.cookie) {
        return
      }

      for (const cookie of documentRef.cookie.split(';')) {
        const name = cookie.split('=')[0]?.trim()
        if (name) {
          documentRef.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
        }
      }
    })
    this.reloadFrame()
  }

  zoomIn() {
    this.setZoom(this.zoomLevel() + ZOOM_STEP)
  }

  zoomOut() {
    this.setZoom(this.zoomLevel() - ZOOM_STEP)
  }

  setZoom(value: number) {
    this.zoomLevel.set(clampZoomLevel(value))
    this.emitBrowserState()
  }

  toggleDeviceToolbar() {
    this.deviceToolbar.update((value) => !value)
    this.emitBrowserState()
  }

  closeDeviceToolbar() {
    this.deviceToolbar.set(false)
    this.emitBrowserState()
  }

  setDeviceViewportWidth(value: unknown) {
    this.deviceViewportWidth.set(clampDeviceViewportSize(value, this.deviceViewportWidth()))
    this.selectedDevicePresetId.set(RESPONSIVE_DEVICE_PRESET_ID)
  }

  setDeviceViewportHeight(value: unknown) {
    this.deviceViewportHeight.set(clampDeviceViewportSize(value, this.deviceViewportHeight()))
    this.selectedDevicePresetId.set(RESPONSIVE_DEVICE_PRESET_ID)
  }

  setDeviceViewportWidthFromEvent(event: Event) {
    this.setDeviceViewportWidth(this.readInputEventValue(event, this.deviceViewportWidth()))
  }

  setDeviceViewportHeightFromEvent(event: Event) {
    this.setDeviceViewportHeight(this.readInputEventValue(event, this.deviceViewportHeight()))
  }

  rotateDeviceViewport() {
    const width = this.deviceViewportWidth()
    this.deviceViewportWidth.set(this.deviceViewportHeight())
    this.deviceViewportHeight.set(width)
  }

  applyDeviceViewportPreset(presetId: string) {
    const preset = this.deviceViewportPresets.find((item) => item.id === presetId)
    if (!preset) {
      return
    }

    this.selectedDevicePresetId.set(preset.id)
    this.deviceViewportWidth.set(preset.width)
    this.deviceViewportHeight.set(preset.height)
  }

  startDeviceViewportResize(event: MouseEvent | TouchEvent, handle: DeviceViewportResizeHandle) {
    event.preventDefault()
    event.stopPropagation()

    const startPointer = this.readPointerEventPosition(event)
    if (!startPointer) {
      return
    }

    this.stopDeviceViewportResize()

    const startWidth = this.deviceViewportWidth()
    const startHeight = this.deviceViewportHeight()
    const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentPointer = this.readPointerEventPosition(moveEvent)
      if (!currentPointer) {
        return
      }

      moveEvent.preventDefault()
      this.selectedDevicePresetId.set(RESPONSIVE_DEVICE_PRESET_ID)

      if (handle === 'left' || handle === 'corner') {
        this.deviceViewportWidth.set(
          clampDeviceViewportSize(startWidth + startPointer.x - currentPointer.x, startWidth)
        )
      }

      if (handle === 'bottom' || handle === 'corner') {
        this.deviceViewportHeight.set(
          clampDeviceViewportSize(startHeight + currentPointer.y - startPointer.y, startHeight)
        )
      }
    }
    const handleEnd = () => {
      this.stopDeviceViewportResize()
    }

    this.#document.addEventListener('mousemove', handleMove)
    this.#document.addEventListener('touchmove', handleMove)
    this.#document.addEventListener('mouseup', handleEnd)
    this.#document.addEventListener('touchend', handleEnd)
    this.#document.addEventListener('touchcancel', handleEnd)
    this.#deviceViewportResizeCleanup = () => {
      this.#document.removeEventListener('mousemove', handleMove)
      this.#document.removeEventListener('touchmove', handleMove)
      this.#document.removeEventListener('mouseup', handleEnd)
      this.#document.removeEventListener('touchend', handleEnd)
      this.#document.removeEventListener('touchcancel', handleEnd)
    }
  }

  openExternal() {
    const openableUrl = this.openableUrl()
    if (!openableUrl) {
      return
    }

    globalThis.open(openableUrl, '_blank', 'noopener,noreferrer')
  }

  toggleInspectMode() {
    this.mode.update((mode) => (mode === 'inspect' ? 'browse' : 'inspect'))
    if (this.mode() === 'browse') {
      this.resetOverlayTargets()
      return
    }

    this.handleFrameLoad()
  }

  handleFrameLoad() {
    this.destroyFrameListeners()
    this.resetOverlayTargets()
    const iframe = this.frameRef()?.nativeElement
    const context = this.buildElementReferenceContext()
    if (!iframe || !context) {
      return
    }

    let documentRef: Document | null = null
    ignoreBlockedFrameAccess(() => {
      documentRef = iframe.contentDocument
    })
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

      const overlayTarget = this.createOverlayTarget(context, target)
      if (!overlayTarget) {
        this.clearHoveredTarget()
        return
      }
      const overlay = this.buildOverlay(overlayTarget)
      this.#hoveredTarget = overlayTarget
      if (overlay) {
        this.hoveredOverlay.set(overlay)
      } else if (!overlayTarget.element.isConnected) {
        this.clearHoveredTarget()
      }
      this.ensureOverlaySyncLoop(documentRef.defaultView)
    }

    const clearHover = (event: MouseEvent) => {
      const relatedTarget = readTargetElement(event.relatedTarget)
      if (relatedTarget && documentRef.contains(relatedTarget)) {
        return
      }

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

      const overlayTarget = this.createOverlayTarget(context, target)
      if (!overlayTarget) {
        return
      }
      const overlay = this.buildOverlayForTarget(overlayTarget)
      if (!overlay) {
        return
      }

      this.#selectedTarget = overlayTarget
      this.selectedOverlay.set(overlay)
      this.clearHoveredTarget()
      this.mode.set('browse')
      this.ensureOverlaySyncLoop(documentRef.defaultView)
      this.referenceRequest.emit(overlay.reference)
    }

    const syncOverlays = () => {
      this.refreshTrackedOverlays()
    }
    const frameWindow = documentRef.defaultView

    documentRef.addEventListener('mousemove', updateHover, true)
    documentRef.addEventListener('mouseover', updateHover, true)
    documentRef.addEventListener('pointermove', updateHover, true)
    documentRef.addEventListener('mouseleave', clearHover, true)
    documentRef.addEventListener('pointerleave', clearHover, true)
    documentRef.addEventListener('click', selectElement, true)
    documentRef.addEventListener('scroll', syncOverlays, true)
    safelyAddFrameWindowEventListener(frameWindow, 'scroll', syncOverlays, true)
    safelyAddFrameWindowEventListener(frameWindow, 'resize', syncOverlays)

    this.#frameCleanup = () => {
      documentRef.removeEventListener('mousemove', updateHover, true)
      documentRef.removeEventListener('mouseover', updateHover, true)
      documentRef.removeEventListener('pointermove', updateHover, true)
      documentRef.removeEventListener('mouseleave', clearHover, true)
      documentRef.removeEventListener('pointerleave', clearHover, true)
      documentRef.removeEventListener('click', selectElement, true)
      documentRef.removeEventListener('scroll', syncOverlays, true)
      safelyRemoveFrameWindowEventListener(frameWindow, 'scroll', syncOverlays, true)
      safelyRemoveFrameWindowEventListener(frameWindow, 'resize', syncOverlays)
    }
  }

  private createOverlayTarget(context: ElementReferenceContext, element: Element): PreviewOverlayTarget | null {
    if (!element.isConnected) {
      return null
    }

    const reference = buildElementReference(context, element)
    if (!reference) {
      return null
    }

    return {
      context,
      element,
      reference
    }
  }

  private buildOverlay(target: PreviewOverlayTarget): PreviewOverlay | null {
    const { element, reference } = target
    if (!element.isConnected) {
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
    return target ? this.buildOverlay(target) : null
  }

  private buildElementReferenceContext(): ElementReferenceContext | null {
    const pageUrl = this.openableUrl()
    if (!pageUrl) {
      return null
    }

    return {
      pageUrl,
      serviceId: 'browser-url'
    }
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

      this.#frameSyncRequestId = safelyRequestFrameAnimationFrame(frameWindow, tick)
      if (this.#frameSyncRequestId === null) {
        this.#frameSyncWindow = null
      }
    }

    this.#frameSyncRequestId = safelyRequestFrameAnimationFrame(frameWindow, tick)
    if (this.#frameSyncRequestId === null) {
      this.#frameSyncWindow = null
    }
  }

  private refreshTrackedOverlays() {
    const hoveredTarget = this.#hoveredTarget
    if (!hoveredTarget) {
      this.hoveredOverlay.set(null)
    } else {
      const hoveredOverlay = this.buildOverlay(hoveredTarget)
      if (hoveredOverlay) {
        this.hoveredOverlay.set(hoveredOverlay)
      } else if (!hoveredTarget.element.isConnected) {
        this.#hoveredTarget = null
        this.hoveredOverlay.set(null)
      }
    }

    const selectedTarget = this.#selectedTarget
    if (!selectedTarget) {
      this.selectedOverlay.set(null)
    } else {
      const selectedOverlay = this.buildOverlay(selectedTarget)
      if (selectedOverlay) {
        this.selectedOverlay.set(selectedOverlay)
      } else if (!selectedTarget.element.isConnected) {
        this.#selectedTarget = null
        this.selectedOverlay.set(null)
      }
    }

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
      safelyCancelFrameAnimationFrame(this.#frameSyncWindow, this.#frameSyncRequestId)
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

  private pushBrowserHistoryIfRequested(address: string, options: BrowserNavigationOptions) {
    if (options.pushHistory === false) {
      return
    }

    const currentHistory = this.history()
    const currentIndex = this.historyIndex()
    if (currentIndex >= 0 && currentHistory[currentIndex] === address) {
      return
    }

    const nextHistory = [...currentHistory.slice(0, currentIndex + 1), address]
    this.history.set(nextHistory)
    this.historyIndex.set(nextHistory.length - 1)
  }

  private emitBrowserStateIfRequested(options: BrowserNavigationOptions) {
    if (options.emitState === false) {
      return
    }

    this.emitBrowserState()
  }

  private emitBrowserState() {
    const displayUrl = this.displayUrl()
    this.browserStateChange.emit({
      deviceToolbarVisible: this.deviceToolbar(),
      displayUrl,
      reloadKey: this.reloadNonce(),
      serviceId: null,
      url: this.externalUrl() ?? displayUrl,
      zoom: this.zoomLevel()
    })
  }

  private readInputEventValue(event: Event, fallback: number) {
    return event.target instanceof HTMLInputElement ? event.target.value : fallback
  }

  private readPointerEventPosition(event: MouseEvent | TouchEvent): DeviceViewportPointer | null {
    if (event instanceof MouseEvent) {
      return {
        x: event.clientX,
        y: event.clientY
      }
    }

    const touch = event.touches[0] ?? event.changedTouches[0]
    return touch
      ? {
          x: touch.clientX,
          y: touch.clientY
        }
      : null
  }

  private stopDeviceViewportResize() {
    this.#deviceViewportResizeCleanup?.()
    this.#deviceViewportResizeCleanup = null
  }
}
