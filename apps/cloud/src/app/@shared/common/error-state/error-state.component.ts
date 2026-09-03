import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'

export type ErrorStateViewModel = {
  message: string | null
  statusLabel: string | null
  details: string | null
}

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-error-state',
  imports: [TranslateModule],
  host: {
    class: 'block w-full min-w-0'
  },
  template: `
    @if (viewModel(); as state) {
      <section
        data-error-state
        class="w-full overflow-hidden rounded-2xl border border-text-destructive/20 bg-components-card-bg shadow-sm"
        role="alert"
        aria-live="assertive"
      >
        <div class="flex items-start gap-4 p-5 sm:p-6">
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-error-bg text-text-destructive"
          >
            <i class="ri-error-warning-line text-xl" aria-hidden="true"></i>
          </div>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base font-semibold text-text-primary">
                {{ title() || ('XP.Common.ErrorState.Title' | translate: { Default: 'Something went wrong' }) }}
              </h2>
              @if (state.statusLabel) {
                <span
                  data-error-state-status
                  class="rounded-full bg-status-error-bg px-2 py-0.5 font-mono text-xs font-medium text-text-destructive"
                >
                  {{ state.statusLabel }}
                </span>
              }
            </div>

            @if (state.message) {
              <p
                data-error-state-message
                class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary"
              >
                {{ state.message }}
              </p>
            }
            @if (description()) {
              <p class="mt-1 text-sm leading-6 text-text-tertiary">
                {{ description() }}
              </p>
            }
          </div>
        </div>

        @if (retryable() || state.details) {
          <div
            class="flex flex-col gap-3 border-t border-divider-subtle bg-background-default-subtle px-5 py-3 sm:px-6"
          >
            @if (retryable()) {
              <button
                type="button"
                data-error-state-retry
                class="btn btn-secondary btn-medium w-fit cursor-pointer"
                (click)="retry.emit()"
              >
                <i class="ri-refresh-line mr-1" aria-hidden="true"></i>
                {{ 'XP.Common.ErrorState.Retry' | translate: { Default: 'Try again' } }}
              </button>
            }

            @if (state.details) {
              <details class="group min-w-0">
                <summary
                  class="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-xs font-medium text-text-secondary outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <i
                    class="ri-arrow-right-s-line text-base transition-transform duration-200 group-open:rotate-90"
                    aria-hidden="true"
                  ></i>
                  {{ 'XP.Common.ErrorState.TechnicalDetails' | translate: { Default: 'Technical details' } }}
                </summary>
                <pre
                  data-error-state-details
                  class="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-divider-subtle bg-components-card-bg p-3 font-mono text-xs leading-5 text-text-secondary"
                ><code>{{ state.details }}</code></pre>
              </details>
            }
          </div>
        }
      </section>
    }
  `
})
export class ErrorStateComponent {
  readonly error = input<unknown>(null)
  readonly title = input<string | null>(null)
  readonly description = input<string | null>(null)
  readonly retryable = input(false)
  readonly retry = output<void>()

  readonly viewModel = computed(() => toErrorStateViewModel(this.error()))
}

export function toErrorStateViewModel(error: unknown): ErrorStateViewModel | null {
  if (error === null || error === undefined) {
    return null
  }

  const rawError = error instanceof Error ? error.message : error
  if (typeof rawError === 'string' && !rawError.trim()) {
    return null
  }

  const parsedError = typeof rawError === 'string' ? parseJsonValue(rawError.trim()) : rawError
  if (!isRecord(parsedError) && !Array.isArray(parsedError)) {
    return {
      message: getDisplayValue(parsedError) ?? String(rawError),
      statusLabel: null,
      details: null
    }
  }

  return {
    message: findErrorMessage(parsedError),
    statusLabel: findErrorStatusLabel(parsedError),
    details: stringifyErrorDetails(parsedError)
  }
}

function parseJsonValue(value: string): unknown {
  let parsed: unknown = value

  for (let depth = 0; depth < 2 && typeof parsed === 'string'; depth++) {
    const candidate = parsed.trim()
    if (!candidate || !['{', '[', '"'].includes(candidate[0])) {
      break
    }
    try {
      parsed = JSON.parse(candidate)
    } catch {
      break
    }
  }

  return parsed
}

function findErrorMessage(value: unknown, visited = new WeakSet<object>()): string | null {
  if (Array.isArray(value)) {
    if (visited.has(value)) {
      return null
    }
    visited.add(value)
    const messages = value
      .map((item) => findErrorMessage(item, visited))
      .filter((message): message is string => Boolean(message))
    return messages.length ? messages.join('\n') : null
  }
  if (!isRecord(value)) {
    return getString(value)
  }
  if (visited.has(value)) {
    return null
  }
  visited.add(value)

  for (const key of ['message', 'error', 'detail', 'description', 'title']) {
    const candidate = value[key]
    const directMessage = getString(candidate)
    if (directMessage) {
      const parsedMessage = parseJsonValue(directMessage)
      return typeof parsedMessage === 'string'
        ? parsedMessage
        : (findErrorMessage(parsedMessage, visited) ?? directMessage)
    }
    const nestedMessage = findErrorMessage(candidate, visited)
    if (nestedMessage) {
      return nestedMessage
    }
  }

  return null
}

function findErrorStatusLabel(value: unknown, visited = new WeakSet<object>()): string | null {
  if (!isRecord(value) || visited.has(value)) {
    return null
  }
  visited.add(value)

  const statusCode = getDisplayValue(value.statusCode)
  if (statusCode) {
    return /^\d{3}$/.test(statusCode) ? `HTTP ${statusCode}` : statusCode
  }

  const code = getDisplayValue(value.code)
  if (code) {
    return code
  }

  return findErrorStatusLabel(value.error, visited) ?? findErrorStatusLabel(value.cause, visited)
}

function stringifyErrorDetails(value: unknown): string | null {
  const visited = new WeakSet<object>()
  try {
    return JSON.stringify(
      value,
      (_key, nestedValue: unknown) => {
        if (nestedValue && typeof nestedValue === 'object') {
          if (visited.has(nestedValue)) {
            return '[Circular]'
          }
          visited.add(nestedValue)
        }
        return nestedValue
      },
      2
    )
  } catch {
    return null
  }
}

function getString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function getDisplayValue(value: unknown): string | null {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : getString(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
