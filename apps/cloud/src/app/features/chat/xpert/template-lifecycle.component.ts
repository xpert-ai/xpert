import { Clipboard } from '@angular/cdk/clipboard'
import { Component, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import type { TemplatePublicationPreview, TemplateUpgradeInput, TemplateUpgradePreview } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage } from '../../../@core'
import { TemplateLifecycleService } from '../../../@core/services/template-lifecycle.service'

@Component({
  selector: 'xp-template-lifecycle',
  standalone: true,
  imports: [FormsModule, TranslateModule, ZardButtonComponent, ZardInputDirective],
  template: `<section class="space-y-4 border-t pt-4">
    <h3 class="font-medium">{{ 'TemplateLifecycle.Title' | translate }}</h3>
    <button z-button zType="outline" type="button" [zDisabled]="busy()" (click)="run(loadSources)">
      {{ 'TemplateLifecycle.SelectSource' | translate }}
    </button>
    @if (sources().length) {
      <label class="block"
        >{{ 'TemplateLifecycle.TargetSource' | translate }}
        <select
          class="w-full rounded-lg border bg-background p-2"
          [(ngModel)]="targetTemplateId"
          (ngModelChange)="upgrade.set(null)"
        >
          <option value="">{{ 'TemplateLifecycle.CurrentSource' | translate }}</option>
          @for (source of sources(); track source.id) {
            <option [value]="source.id">{{ source.title }} · {{ source.source || 'builtin' }}</option>
          }
        </select>
      </label>
    }
    <div class="flex flex-wrap gap-2">
      <button z-button zType="outline" type="button" [zDisabled]="busy()" (click)="run(loadPublication)">
        {{ 'TemplateLifecycle.PreviewPublication' | translate }}
      </button>
      <button z-button zType="outline" type="button" [zDisabled]="busy()" (click)="run(loadUpgrade)">
        {{ 'TemplateLifecycle.CheckUpdates' | translate }}
      </button>
    </div>
    @if (error()) {
      <p role="alert" class="text-text-destructive">{{ error() }}</p>
    }
    @if (message()) {
      <p role="status">{{ message() | translate }}</p>
    }
    @if (publication(); as value) {
      <p class="text-sm text-text-secondary">{{ 'TemplateLifecycle.Excluded' | translate }}</p>
      @if (value.blocked.length) {
        <p role="alert">{{ 'TemplateLifecycle.Unsupported' | translate }}: {{ value.blocked.join(', ') }}</p>
      }
      <details>
        <summary>{{ 'TemplateLifecycle.PortableContent' | translate }}</summary>
        <pre
          class="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-components-panel-bg-alt p-3 text-xs"
          >{{ value.content }}</pre
        >
      </details>
      <label class="block"
        >{{ 'TemplateLifecycle.Version' | translate }}<input z-input class="w-full" [(ngModel)]="version"
      /></label>
      <label class="block"
        >{{ 'TemplateLifecycle.ReleaseNotes' | translate }}<input z-input class="w-full" [(ngModel)]="notes"
      /></label>
      <label class="block"
        >{{ 'TemplateLifecycle.Visibility' | translate
        }}<select class="w-full rounded-lg border bg-background p-2" [(ngModel)]="visibility">
          <option value="team">{{ 'TemplateLifecycle.Team' | translate }}</option>
          <option value="public">{{ 'TemplateLifecycle.Public' | translate }}</option>
        </select></label
      >
      <label class="flex items-start gap-2 text-sm"
        ><input type="checkbox" [(ngModel)]="reviewed" />{{ 'TemplateLifecycle.Reviewed' | translate }}</label
      >
      <button
        z-button
        type="button"
        [zDisabled]="busy() || !reviewed || !!value.blocked.length || !validVersion"
        (click)="run(publish)"
      >
        {{ 'TemplateLifecycle.Publish' | translate }}
      </button>
      @if (value.publication; as row) {
        <p>
          {{ row.version }} ·
          {{ (row.revoked ? 'TemplateLifecycle.Withdrawn' : 'TemplateLifecycle.Published') | translate }}
        </p>
        @if (!row.revoked) {
          <label class="block"
            >{{ 'TemplateLifecycle.ShareLink' | translate
            }}<input z-input readonly class="w-full" [value]="shareLink(row.id)"
          /></label>
          <div class="flex gap-2">
            <button z-button zType="outline" type="button" (click)="copy(row.id)">
              {{ 'TemplateLifecycle.CopyLink' | translate }}
            </button>
            <button z-button zType="outline" type="button" [zDisabled]="busy()" (click)="run(revoke)">
              {{ 'TemplateLifecycle.Withdraw' | translate }}
            </button>
          </div>
        }
      }
    }
    @if (upgrade(); as value) {
      @if (value.previousTemplateId && value.previousTemplateId !== value.templateId) {
        <p class="break-all text-sm">
          {{ 'TemplateLifecycle.SourceMigration' | translate }}: {{ value.previousTemplateId }} → {{ value.templateId }}
        </p>
      }
      <p>{{ 'TemplateLifecycle.SourceVersion' | translate }}: {{ value.version || '—' }}</p>
      <p class="text-sm text-text-secondary">{{ value.releaseNotes }}</p>
      @if (!value.baselineAvailable) {
        <p>{{ 'TemplateLifecycle.NoBaseline' | translate }}</p>
      }
      @if (value.blocked.length) {
        <p role="alert">{{ 'TemplateLifecycle.Unsupported' | translate }}: {{ value.blocked.join(', ') }}</p>
      }
      @if (!value.changes.length && !value.blocked.length) {
        <p>{{ 'TemplateLifecycle.UpToDate' | translate }}</p>
      }
      @for (change of value.changes; track change.section) {
        <div class="space-y-2 border-b pb-3">
          <h4 class="font-medium">
            {{ 'TemplateLifecycle.Section.' + change.section | translate }}
            @if (change.conflict) {
              · {{ 'TemplateLifecycle.Conflict' | translate }}
            }
          </h4>
          <details>
            <summary>{{ 'TemplateLifecycle.Compare' | translate }}</summary>
            <div class="grid gap-3">
              <pre class="max-h-44 overflow-auto whitespace-pre-wrap text-xs"
                >{{ 'TemplateLifecycle.Before' | translate }}
{{ change.before }}</pre
              >
              <pre class="max-h-44 overflow-auto whitespace-pre-wrap text-xs"
                >{{ 'TemplateLifecycle.After' | translate }}
{{ change.after }}</pre
              >
            </div>
          </details>
          <select
            class="w-full rounded-lg border bg-background p-2"
            [attr.aria-label]="'TemplateLifecycle.Section.' + change.section | translate"
            [(ngModel)]="choices[change.section]"
          >
            <option [ngValue]="undefined" disabled>{{ 'TemplateLifecycle.Choose' | translate }}</option>
            <option value="keep">{{ 'TemplateLifecycle.Keep' | translate }}</option>
            <option value="replace">{{ 'TemplateLifecycle.Replace' | translate }}</option>
          </select>
        </div>
      }
      <p class="text-sm text-text-secondary">{{ 'TemplateLifecycle.Preserved' | translate }}</p>
      @if (value.changes.length || value.previousTemplateId !== value.templateId) {
        <button z-button type="button" [zDisabled]="busy() || !canApply" (click)="run(apply)">
          {{ 'TemplateLifecycle.SaveDraft' | translate }}
        </button>
      }
      @if (value.operation; as operation) {
        <p>{{ 'TemplateLifecycle.State.' + operation.state | translate }}</p>
        <div class="flex flex-wrap gap-2">
          @if (operation.canResume) {
            <button z-button type="button" [zDisabled]="busy()" (click)="action('resume', operation.id)">
              {{ 'TemplateLifecycle.PublishUpgrade' | translate }}
            </button>
          }
          @if (operation.canRollback) {
            <button
              z-button
              zType="outline"
              type="button"
              [zDisabled]="busy()"
              (click)="action('rollback', operation.id)"
            >
              {{ 'TemplateLifecycle.Rollback' | translate }}
            </button>
          }
        </div>
      }
    }
  </section>`
})
export class TemplateLifecycleComponent {
  readonly assistantId = input.required<string>()
  readonly api = inject(TemplateLifecycleService)
  readonly clipboard = inject(Clipboard)
  readonly publication = signal<TemplatePublicationPreview | null>(null)
  readonly upgrade = signal<TemplateUpgradePreview | null>(null)
  readonly error = signal('')
  readonly message = signal('')
  readonly busy = signal(false)
  readonly sources = signal<import('@xpert-ai/contracts').TemplateUpgradeSource[]>([])
  targetTemplateId = ''
  loadSources = async () => {
    this.sources.set(await firstValueFrom(this.api.sources(this.assistantId())))
  }
  version = '1.0.0'
  notes = ''
  reviewed = false
  visibility: 'team' | 'public' = 'team'
  choices: NonNullable<TemplateUpgradeInput['choices']> = {}
  get validVersion() {
    return /^\d+\.\d+\.\d+$/.test(this.version)
  }
  get canApply() {
    const value = this.upgrade()
    return (
      value &&
      !value.blocked.length &&
      value.changes.every((change) => !!this.choices[change.section]) &&
      !['draft', 'failed'].includes(value.operation?.state ?? '')
    )
  }
  async run(work: () => Promise<void>) {
    this.busy.set(true)
    this.error.set('')
    this.message.set('')
    try {
      await work()
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.busy.set(false)
    }
  }
  loadPublication = async () => {
    const value = await firstValueFrom(this.api.publication(this.assistantId()))
    this.publication.set(value)
    this.upgrade.set(null)
    this.reviewed = false
    if (value.publication) {
      const parts = value.publication.version.split('.')
      parts[2] = String(Number(parts[2]) + 1)
      this.version = parts.join('.')
      this.visibility = value.publication.visibility
    }
  }
  loadUpgrade = async () => {
    const value = await firstValueFrom(this.api.upgrade(this.assistantId(), this.targetTemplateId || undefined))
    this.upgrade.set(value)
    this.publication.set(null)
    this.choices = Object.fromEntries(
      value.changes.filter((change) => !change.conflict).map((change) => [change.section, 'replace'])
    )
  }
  publish = async () => {
    const value = this.publication()
    await firstValueFrom(
      this.api.publish(this.assistantId(), {
        revision: value.revision,
        contentHash: value.contentHash,
        visibility: this.visibility,
        version: this.version,
        releaseNotes: this.notes
      })
    )
    await this.loadPublication()
    this.message.set('TemplateLifecycle.Published')
  }
  revoke = async () => {
    await firstValueFrom(this.api.revoke(this.assistantId()))
    await this.loadPublication()
  }
  apply = async () => {
    const value = this.upgrade()
    await firstValueFrom(
      this.api.apply(this.assistantId(), {
        revision: value.revision,
        sourceHash: value.sourceHash,
        targetTemplateId: value.templateId,
        choices: this.choices
      })
    )
    await this.loadUpgrade()
  }
  action(action: 'resume' | 'rollback', id: string) {
    return this.run(async () => {
      await firstValueFrom(this.api.action(this.assistantId(), action, id))
      await this.loadUpgrade()
    })
  }
  shareLink(id: string) {
    return `${location.origin}/explore/templates/${encodeURIComponent(id)}`
  }
  copy(id: string) {
    this.message.set(
      this.clipboard.copy(this.shareLink(id)) ? 'TemplateLifecycle.Copied' : 'TemplateLifecycle.CopyFailed'
    )
  }
}
