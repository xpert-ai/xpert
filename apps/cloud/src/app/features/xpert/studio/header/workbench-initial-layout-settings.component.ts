import { Component, computed, effect, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  type TXpertWorkbenchOptions,
  type XpertExtensionViewManifest,
  XpertWorkbenchInitialLayoutEnum
} from '@xpert-ai/contracts'
import {
  ZardRadioComponent,
  ZardRadioGroupComponent,
  ZardSelectImports,
  type ZardSelectValue
} from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { resolveI18nText, ViewExtensionApiService } from '../../../../@core'
import { EReloadReason, XpertStudioApiService } from '../domain'

const AGENT_WORKBENCH_FIXED_SLOT = 'agent.workbench.fixed'

type WorkbenchViewOption = {
  key: string
  label: string
}

@Component({
  selector: 'xp-xpert-workbench-initial-layout-settings',
  standalone: true,
  imports: [FormsModule, TranslateModule, ZardRadioComponent, ZardRadioGroupComponent, ...ZardSelectImports],
  template: `
    <section
      data-xpert-workbench-initial-layout-settings
      class="rounded-lg bg-background-default-subtle p-3"
      [attr.aria-labelledby]="titleId"
    >
      <div class="flex items-start gap-3">
        <i class="ri-layout-column-line mt-0.5 text-xl text-primary" aria-hidden="true"></i>
        <div class="min-w-0">
          <div [id]="titleId" class="text-sm font-semibold leading-6 text-text-primary">
            {{ 'XP.Xpert.WorkbenchInitialLayout' | translate: { Default: 'Initial chat layout' } }}
          </div>
          <p class="mt-0.5 text-xs leading-5 text-text-secondary">
            {{
              'XP.Xpert.WorkbenchInitialLayoutTip'
                | translate
                  : {
                      Default:
                        'Choose the layout used the first time a user opens this Xpert. A saved personal layout takes priority.'
                    }
            }}
          </p>
        </div>
      </div>

      <z-radio-group
        class="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4"
        displayDensity="cosy"
        [ngModel]="initialLayout()"
        (ngModelChange)="setInitialLayout($event)"
        [attr.aria-label]="'XP.Xpert.WorkbenchInitialLayout' | translate: { Default: 'Initial chat layout' }"
      >
        <div
          class="rounded-lg border p-3 transition-colors"
          [class]="
            initialLayout() === eInitialLayout.TwoColumns
              ? 'border-primary bg-components-card-bg'
              : 'border-divider-regular bg-components-card-bg hover:bg-components-panel-bg'
          "
        >
          <z-radio class="w-full" [value]="eInitialLayout.TwoColumns">
            <span class="block font-medium text-text-primary">
              {{ 'XP.Xpert.TwoColumnLayout' | translate: { Default: 'Two columns' } }}
            </span>
            <span class="mt-1 block text-xs leading-5 text-text-secondary">
              {{ 'XP.Xpert.TwoColumnLayoutTip' | translate: { Default: 'Show Workbench and ChatKit side by side.' } }}
            </span>
          </z-radio>
        </div>

        <div
          class="rounded-lg border p-3 transition-colors"
          [class]="
            initialLayout() === eInitialLayout.OverlayDialog
              ? 'border-primary bg-components-card-bg'
              : 'border-divider-regular bg-components-card-bg hover:bg-components-panel-bg'
          "
        >
          <z-radio class="w-full" [value]="eInitialLayout.OverlayDialog">
            <span class="block font-medium text-text-primary">
              {{ 'XP.Xpert.OverlayDialog' | translate: { Default: 'Overlay dialog' } }}
            </span>
            <span class="mt-1 block text-xs leading-5 text-text-secondary">
              {{
                'XP.Xpert.OverlayDialogTip'
                  | translate
                    : {
                        Default: 'Float ChatKit above the Workbench. Minimize it to the pet, or pin it to the right.'
                      }
              }}
            </span>
          </z-radio>
        </div>

        <div
          class="rounded-lg border p-3 transition-colors"
          [class]="
            initialLayout() === eInitialLayout.ChatkitMaximized
              ? 'border-primary bg-components-card-bg'
              : 'border-divider-regular bg-components-card-bg hover:bg-components-panel-bg'
          "
        >
          <z-radio class="w-full" [value]="eInitialLayout.ChatkitMaximized">
            <span class="block font-medium text-text-primary">
              {{ 'XP.Xpert.ChatKitMaximized' | translate: { Default: 'ChatKit maximized' } }}
            </span>
            <span class="mt-1 block text-xs leading-5 text-text-secondary">
              {{
                'XP.Xpert.ChatKitMaximizedTip'
                  | translate: { Default: 'Start with the conversation expanded and Workbench minimized.' }
              }}
            </span>
          </z-radio>
        </div>

        <div
          class="rounded-lg border p-3 transition-colors"
          [class]="
            initialLayout() === eInitialLayout.WorkbenchMaximized
              ? 'border-primary bg-components-card-bg'
              : 'border-divider-regular bg-components-card-bg hover:bg-components-panel-bg'
          "
        >
          <z-radio class="w-full" [value]="eInitialLayout.WorkbenchMaximized">
            <span class="block font-medium text-text-primary">
              {{ 'XP.Xpert.WorkbenchMaximized' | translate: { Default: 'Workbench maximized' } }}
            </span>
            <span class="mt-1 block text-xs leading-5 text-text-secondary">
              {{
                'XP.Xpert.WorkbenchMaximizedTip'
                  | translate: { Default: 'Start with extension views expanded and ChatKit minimized.' }
              }}
            </span>
          </z-radio>
        </div>
      </z-radio-group>

      <div class="mt-4 border-t border-divider-regular pt-3">
        <div class="text-sm font-medium text-text-primary">
          {{ 'XP.Xpert.WorkbenchDefaultView' | translate: { Default: 'Default Workbench view' } }}
        </div>
        <p class="mt-0.5 text-xs leading-5 text-text-secondary">
          {{
            'XP.Xpert.WorkbenchDefaultViewTip'
              | translate
                : {
                    Default:
                      'Choose the extension view selected when Workbench opens. If it is unavailable, the first view is used.'
                  }
          }}
        </p>

        @if (loadingViews()) {
          <div class="mt-2 flex h-9 items-center gap-2 text-xs text-text-tertiary" role="status">
            <span class="size-2 animate-pulse rounded-full bg-current" aria-hidden="true"></span>
            {{ 'XP.Xpert.LoadingWorkbenchViews' | translate: { Default: 'Loading extension views…' } }}
          </div>
        } @else if (viewLoadFailed()) {
          <div class="mt-2 flex min-h-9 items-center justify-between gap-3 text-xs text-text-secondary">
            <span>
              {{ 'XP.Xpert.WorkbenchViewsLoadFailed' | translate: { Default: 'Unable to load extension views.' } }}
            </span>
            <button type="button" class="font-medium text-primary hover:underline" (click)="reloadViews()">
              {{ 'XP.ACTIONS.Retry' | translate: { Default: 'Retry' } }}
            </button>
          </div>
        } @else if (viewOptions().length > 0) {
          <z-select
            class="mt-2 w-full"
            [zValue]="selectedDefaultViewKey()"
            (zSelectionChange)="setDefaultViewKey($event)"
            [zPlaceholder]="'XP.Xpert.SelectWorkbenchView' | translate: { Default: 'Select an extension view' }"
          >
            @for (view of viewOptions(); track view.key) {
              <z-select-item [zValue]="view.key">{{ view.label }}</z-select-item>
            }
          </z-select>
        } @else {
          <div class="mt-2 flex min-h-9 items-center text-xs text-text-tertiary">
            {{
              'XP.Xpert.NoWorkbenchViews'
                | translate: { Default: 'No extension views are currently available for this Xpert.' }
            }}
          </div>
        }
      </div>

      <p class="mt-2 text-xs leading-5 text-text-tertiary">
        {{
          'XP.Xpert.WorkbenchInitialLayoutPublishTip'
            | translate: { Default: 'Save and publish the draft to apply this setting.' }
        }}
      </p>
    </section>
  `
})
export class XpertWorkbenchInitialLayoutSettingsComponent {
  readonly eInitialLayout = XpertWorkbenchInitialLayoutEnum
  readonly titleId = 'xpert-workbench-initial-layout-title'
  readonly #apiService = inject(XpertStudioApiService)
  readonly #viewExtensionApi = inject(ViewExtensionApiService)
  readonly #translate = inject(TranslateService)
  #viewLoadRequestId = 0

  readonly initialLayout = computed(
    () =>
      this.#apiService.xpert()?.options?.workbench?.initialLayout ?? XpertWorkbenchInitialLayoutEnum.ChatkitMaximized
  )
  readonly defaultViewKey = computed(() => this.#apiService.xpert()?.options?.workbench?.defaultViewKey?.trim() || null)
  readonly xpertId = computed(() => this.#apiService.xpert()?.id?.trim() || null)
  readonly viewOptions = signal<WorkbenchViewOption[]>([])
  readonly loadingViews = signal(false)
  readonly viewLoadFailed = signal(false)
  readonly selectedDefaultViewKey = computed(() => {
    const options = this.viewOptions()
    const configuredViewKey = this.defaultViewKey()
    return options.some((view) => view.key === configuredViewKey) ? configuredViewKey : (options[0]?.key ?? null)
  })

  constructor() {
    effect(() => {
      void this.loadViews(this.xpertId())
    })
  }

  setInitialLayout(initialLayout: XpertWorkbenchInitialLayoutEnum) {
    const workbench = this.#apiService.xpert()?.options?.workbench
    const currentLayout = workbench?.initialLayout ?? XpertWorkbenchInitialLayoutEnum.ChatkitMaximized
    if (currentLayout === initialLayout) {
      return
    }

    this.updateWorkbenchOptions({ initialLayout })
  }

  setDefaultViewKey(value: ZardSelectValue | ZardSelectValue[] | null) {
    const defaultViewKey = normalizeSelectValue(value)
    if (!defaultViewKey || defaultViewKey === this.defaultViewKey()) {
      return
    }

    this.updateWorkbenchOptions({ defaultViewKey })
  }

  reloadViews() {
    void this.loadViews(this.xpertId())
  }

  private updateWorkbenchOptions(change: Partial<TXpertWorkbenchOptions>) {
    const workbench = this.#apiService.xpert()?.options?.workbench
    this.#apiService.updateXpertOptions(
      {
        workbench: {
          ...workbench,
          ...change
        }
      },
      EReloadReason.XPERT_UPDATED
    )
  }

  private async loadViews(xpertId: string | null) {
    const requestId = ++this.#viewLoadRequestId
    this.viewLoadFailed.set(false)

    if (!xpertId) {
      this.loadingViews.set(false)
      this.viewOptions.set([])
      return
    }

    this.loadingViews.set(true)
    try {
      const manifests = await firstValueFrom(
        this.#viewExtensionApi.getSlotViews('agent', xpertId, AGENT_WORKBENCH_FIXED_SLOT, { isDraft: true })
      )
      if (requestId !== this.#viewLoadRequestId) {
        return
      }

      this.viewOptions.set(
        manifests
          .filter(shouldShowFixedView)
          .map((manifest) => toWorkbenchViewOption(manifest, this.#translate.currentLang))
      )
    } catch {
      if (requestId !== this.#viewLoadRequestId) {
        return
      }

      this.viewOptions.set([])
      this.viewLoadFailed.set(true)
    } finally {
      if (requestId === this.#viewLoadRequestId) {
        this.loadingViews.set(false)
      }
    }
  }
}

function normalizeSelectValue(value: ZardSelectValue | ZardSelectValue[] | null) {
  const selected = Array.isArray(value) ? value[0] : value
  return typeof selected === 'string' && selected.trim() ? selected.trim() : null
}

function shouldShowFixedView(manifest: XpertExtensionViewManifest) {
  return (
    manifest.visible !== false && manifest.workbench?.fixed !== false && manifest.workbench?.menu?.enabled !== false
  )
}

function toWorkbenchViewOption(manifest: XpertExtensionViewManifest, language: string): WorkbenchViewOption {
  return {
    key: manifest.key,
    label: resolveI18nText(manifest.workbench?.menu?.label ?? manifest.title, language) ?? manifest.key
  }
}
