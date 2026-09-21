import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { XpertWorkbenchInitialLayoutEnum } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardSelectImports, type ZardSelectValue } from '@xpert-ai/headless-ui'
import { ViewExtensionApiService, resolveI18nText } from '@cloud/app/@core'
import { firstValueFrom } from 'rxjs'
import { XpertSettingsEditor } from './xpert-settings.editor'

@Component({
  selector: 'xp-settings-workbench',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslateModule, ZardButtonComponent, ...ZardSelectImports],
  template: `
    <h3 class="text-lg font-semibold">{{ 'XP.Xpert.WorkbenchInitialLayout' | translate }}</h3>
    <p class="mt-1 text-sm leading-5 text-text-tertiary">{{ 'XP.XpertSettings.LayoutPriority' | translate }}</p>
    <fieldset class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <legend class="sr-only">{{ 'XP.Xpert.WorkbenchInitialLayout' | translate }}</legend>
      @for (layout of layouts; track layout.value) {
        <label
          class="relative cursor-pointer rounded-[var(--assistant-settings-item-radius)] border px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-primary"
          [class]="
            form.initialLayout.value === layout.value
              ? 'border-text-primary bg-background-default-subtle'
              : 'border-divider-regular hover:bg-hover-bg'
          "
        >
          <img
            class="mb-2 h-[104px] w-full rounded-md object-contain dark:invert dark:opacity-80"
            [src]="'assets/images/assistant-settings/' + layout.image"
            alt=""
          />
          <div class="flex items-center gap-2 text-base font-semibold">
            <input
              type="radio"
              name="assistant-initial-layout"
              class="size-4 accent-primary"
              [value]="layout.value"
              [formControl]="form.initialLayout"
            />{{ layout.title | translate }}
          </div>
          <p class="mt-1 pl-6 text-sm leading-5 text-text-secondary">{{ layout.description | translate }}</p>
        </label>
      }
    </fieldset>
    <section class="mt-5 border-t border-divider-regular pt-4">
      <h3 class="text-lg font-semibold">{{ 'XP.Xpert.WorkbenchDefaultView' | translate }}</h3>
      <p class="mt-1 text-sm leading-5 text-text-tertiary">{{ 'XP.Xpert.WorkbenchDefaultViewTip' | translate }}</p>
      @if (loading()) {
        <p class="mt-3 text-sm text-text-tertiary" role="status">
          {{ 'XP.Xpert.LoadingWorkbenchViews' | translate }}
        </p>
      } @else if (failed()) {
        <div class="mt-3 flex items-center justify-between gap-3 text-base text-text-secondary">
          <span>{{ 'XP.Xpert.WorkbenchViewsLoadFailed' | translate }}</span
          ><button z-button zType="outline" (click)="loadViews()">{{ 'XP.ACTIONS.Retry' | translate }}</button>
        </div>
      } @else {
        <label class="mt-3 block">
          <span class="sr-only">{{ 'XP.Xpert.WorkbenchDefaultView' | translate }}</span>
          <z-select
            class="block rounded-[var(--assistant-settings-item-radius)] [&>button]:rounded-[var(--assistant-settings-item-radius)]"
            zSize="lg"
            [zValue]="form.defaultViewKey.value || 0"
            (zSelectionChange)="selectView($event)"
          >
            <z-select-item [zValue]="0">{{ 'XP.XpertSettings.FirstAvailableView' | translate }}</z-select-item>
            @if (unavailable()) {
              <z-select-item [zValue]="form.defaultViewKey.value!">{{
                'XP.XpertSettings.UnavailableView' | translate
              }}</z-select-item>
            }
            @for (view of views(); track view.key) {
              <z-select-item [zValue]="view.key">{{ view.label }}</z-select-item>
            }
          </z-select>
        </label>
        @if (!views().length) {
          <p class="mt-2 text-sm text-text-tertiary">{{ 'XP.Xpert.NoWorkbenchViews' | translate }}</p>
        }
        @if (unavailable()) {
          <p class="mt-2 text-sm text-text-warning">{{ 'XP.XpertSettings.ViewFallback' | translate }}</p>
        }
      }
    </section>
  `
})
export class SettingsWorkbenchComponent {
  readonly editor = inject(XpertSettingsEditor)
  readonly form = this.editor.form.controls.workbench.controls
  private readonly api = inject(ViewExtensionApiService)
  private readonly translate = inject(TranslateService)
  readonly loading = signal(false)
  readonly failed = signal(false)
  readonly views = signal<Array<{ key: string; label: string }>>([])
  readonly layouts = [
    {
      value: XpertWorkbenchInitialLayoutEnum.TwoColumns,
      title: 'XP.Xpert.TwoColumnLayout',
      description: 'XP.XpertSettings.LayoutDescription.TwoColumn',
      image: 'layout-two-columns.png'
    },
    {
      value: XpertWorkbenchInitialLayoutEnum.OverlayDialog,
      title: 'XP.Xpert.OverlayDialog',
      description: 'XP.XpertSettings.LayoutDescription.OverlayDialog',
      image: 'layout-overlay.png'
    },
    {
      value: XpertWorkbenchInitialLayoutEnum.ChatkitMaximized,
      title: 'XP.Xpert.ChatKitMaximized',
      description: 'XP.XpertSettings.LayoutDescription.ChatKitMaximized',
      image: 'layout-chatkit.png'
    },
    {
      value: XpertWorkbenchInitialLayoutEnum.WorkbenchMaximized,
      title: 'XP.Xpert.WorkbenchMaximized',
      description: 'XP.XpertSettings.LayoutDescription.WorkbenchMaximized',
      image: 'layout-workbench.png'
    }
  ]
  constructor() {
    void this.loadViews()
  }
  unavailable() {
    return !!this.form.defaultViewKey.value && !this.views().some((view) => view.key === this.form.defaultViewKey.value)
  }
  selectView(value: ZardSelectValue | ZardSelectValue[]) {
    // Keep the draft's null fallback while using a selectable value in Zard Select.
    if (value !== 0 && typeof value !== 'string') return
    this.form.defaultViewKey.markAsDirty()
    this.form.defaultViewKey.setValue(value === 0 ? null : value)
  }
  async loadViews() {
    this.loading.set(true)
    this.failed.set(false)
    try {
      const manifests = await firstValueFrom(
        this.api.getSlotViews('agent', this.editor.source.id, 'agent.workbench.fixed', { isDraft: true })
      )
      this.views.set(
        manifests
          .filter(
            (view) =>
              view.visible !== false && view.workbench?.fixed !== false && view.workbench?.menu?.enabled !== false
          )
          .map((view) => ({
            key: view.key,
            label: resolveI18nText(view.workbench?.menu?.label ?? view.title, this.translate.currentLang) ?? view.key
          }))
      )
    } catch {
      this.failed.set(true)
    } finally {
      this.loading.set(false)
    }
  }
}
