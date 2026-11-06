import { CommonModule } from '@angular/common'
import { Component, computed, input, output } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type { IPluginDescriptor, PluginVersionCheckResult } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xp-plugin-version-status',
  standalone: true,
  imports: [CommonModule, TranslateModule, ZardButtonComponent, ZardTooltipImports],
  host: { class: 'inline-flex min-w-0 max-w-full' },
  template: `
    <div class="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
      <span
        tabindex="0"
        class="rounded border border-divider px-1 font-mono"
        [zTooltip]="
          ('XP.Plugin.RunningVersion' | translate) + ': ' + (runningVersion() || ('XP.Plugin.NotRunning' | translate))
        "
      >
        {{ runningVersion() ? 'v' + runningVersion() : ('XP.Plugin.NotRunning' | translate) }}
      </span>
      <span tabindex="0" class="inline-flex items-center gap-1" [zTooltip]="installationDetails">
        {{ 'XP.Plugin.InstallMethod_' + (plugin().installation?.method || 'unknown') | translate }}
        @if (plugin().updateUnavailableReason) {
          <i aria-hidden="true" class="ri-information-line"></i>
        }
      </span>
      @if (plugin().loadStatus === 'pending_restart') {
        <span
          tabindex="0"
          class="text-text-warning"
          [zTooltip]="
            'XP.Plugin.StagedVersion' | translate: { version: plugin().installedVersion || plugin().meta.version }
          "
        >
          {{
            'XP.Plugin.StagedVersionShort' | translate: { version: plugin().installedVersion || plugin().meta.version }
          }}
        </span>
      }
      @if (canCheck()) {
        <span role="status" aria-live="polite" aria-atomic="true" tabindex="0" [zTooltip]="checkDetails">
          @if (checking()) {
            <i aria-hidden="true" class="ri-loader-4-line inline-block animate-spin"></i>
            <span class="sr-only">{{ 'XP.Plugin.CheckingVersion' | translate }}</span>
          } @else if (check()?.status === 'failed') {
            <span class="text-text-warning"
              ><i aria-hidden="true" class="ri-error-warning-line"></i>
              {{ 'XP.Plugin.VersionCheckFailedShort' | translate }}</span
            >
          } @else if (check()?.latestVersion) {
            <span class="font-mono">npm {{ check()?.latestVersion }}</span>
          }
        </span>
        <button
          z-button
          zType="ghost"
          zSize="icon-xs"
          type="button"
          [disabled]="checking()"
          [attr.aria-label]="
            (check()?.status === 'failed' ? 'XP.Plugin.RetryVersionCheck' : 'XP.Plugin.CheckUpdates') | translate
          "
          [zTooltip]="
            (check()?.status === 'failed' ? 'XP.Plugin.RetryVersionCheck' : 'XP.Plugin.CheckUpdates') | translate
          "
          (click)="checkRequested.emit()"
        >
          <i aria-hidden="true" class="ri-refresh-line"></i>
        </button>
      }
      @if (plugin().installation?.method === 'archive' && plugin().canUninstall) {
        <button
          z-button
          zType="ghost"
          zSize="icon-xs"
          type="button"
          [attr.aria-label]="'XP.Plugin.UploadNewVersion' | translate"
          [zTooltip]="'XP.Plugin.UploadNewVersion' | translate"
          (click)="uploadRequested.emit()"
        >
          <i aria-hidden="true" class="ri-upload-cloud-2-line"></i>
        </button>
      }
    </div>
    <ng-template #installationDetails>
      <div class="max-w-xs space-y-1">
        <p>
          {{ 'XP.Plugin.InstallationMethod' | translate }}:
          {{ 'XP.Plugin.InstallMethod_' + (plugin().installation?.method || 'unknown') | translate }}
        </p>
        @if (plugin().updateUnavailableReason; as reason) {
          <p>{{ 'XP.Plugin.UpdateReason_' + reason | translate }}</p>
        }
      </div>
    </ng-template>
    <ng-template #checkDetails>
      <div class="max-w-xs space-y-1">
        @if (check(); as result) {
          @if (result.status === 'failed') {
            <p>{{ 'XP.Plugin.VersionCheckError_' + (result.errorCode || 'REGISTRY_UNAVAILABLE') | translate }}</p>
            @if (result.latestVersion) {
              <p>
                {{ 'XP.Plugin.LastKnownVersion' | translate: { version: result.latestVersion } }} ·
                {{ result.lastSuccessfulCheckAt | date: 'short' }}
              </p>
            }
          } @else {
            <p>
              {{
                (plugin().hasUpdate ? 'XP.Plugin.NewRegistryVersion' : 'XP.Plugin.NoNewRegistryVersion')
                  | translate: { version: result.latestVersion }
              }}
            </p>
          }
          <p>{{ 'XP.Plugin.LastVersionCheck' | translate }}: {{ result.checkedAt | date: 'short' }}</p>
        } @else {
          <p>{{ 'XP.Plugin.VersionUnchecked' | translate }}</p>
        }
      </div>
    </ng-template>
  `
})
export class PluginVersionStatusComponent {
  readonly plugin = input.required<IPluginDescriptor>()
  readonly check = input<PluginVersionCheckResult>()
  readonly checking = input(false)
  readonly checkRequested = output<void>()
  readonly uploadRequested = output<void>()
  readonly canCheck = computed(() => this.plugin().canUpdate && !this.plugin().updateUnavailableReason)
  readonly runningVersion = computed(
    () =>
      this.plugin().runningVersion ??
      (!this.plugin().loadStatus || this.plugin().loadStatus === 'loaded' ? this.plugin().currentVersion : undefined)
  )
}
