import { HttpClient } from '@angular/common/http'
import { Component, inject, signal } from '@angular/core'
import { FormControl, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { OutputPreference } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardInputDirective, ZardSelectImports } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { API_PREFIX } from '../../@core/state/constants'

type Settings = {
  preferences: OutputPreference[]
  integrations: { id: string; name: string }[]
  kinds: { key: string; label: { en_US: string; zh_Hans: string } }[]
}

@Component({
  selector: 'xp-output-preferences',
  standalone: true,
  imports: [TranslateModule, ReactiveFormsModule, ZardButtonComponent, ZardInputDirective, ...ZardSelectImports],
  template: `
    <button z-button zType="outline" (click)="toggle()">{{ 'XP.Notifications.DeliverySettings' | translate }}</button>
    @if (open() && data(); as state) {
      <div class="grid gap-3">
        @for (kind of state.kinds; track kind.key) {
          <section>
            <h4>{{ chinese() ? kind.label.zh_Hans : kind.label.en_US }}</h4>
            @for (channel of channels; track channel) {
              <button z-button zType="ghost" [disabled]="busy()" (click)="select(kind.key, channel)">
                {{ (channel === 'lark' ? 'XP.Notifications.PrivateLark' : 'XP.Notifications.InApp') | translate }}
                · {{ (enabled(kind.key, channel) ? 'XP.Notifications.On' : 'XP.Notifications.Off') | translate }}
              </button>
            }
          </section>
        }
        @if (selected(); as current) {
          @if (current.channel === 'lark') {
            <label
              >{{ 'XP.Notifications.Bot' | translate }}
              <z-select [formControl]="integration">
                @for (bot of state.integrations; track bot.id) {
                  <z-select-item [zValue]="bot.id">{{ bot.name }}</z-select-item>
                }
              </z-select>
            </label>
          }
          <label>{{ 'XP.Notifications.Timezone' | translate }}<input z-input [formControl]="zone" /></label>
          <div class="flex gap-2">
            <label
              >{{ 'XP.Notifications.QuietStart' | translate }}<input z-input type="time" [formControl]="start"
            /></label>
            <label
              >{{ 'XP.Notifications.QuietEnd' | translate }}<input z-input type="time" [formControl]="end"
            /></label>
          </div>
          <div class="flex gap-2">
            <button z-button [disabled]="busy()" (click)="save(true)">
              {{ 'XP.Notifications.Enable' | translate }}
            </button>
            <button z-button zType="outline" [disabled]="busy()" (click)="save(false)">
              {{ 'XP.Notifications.Disable' | translate }}
            </button>
          </div>
        }
      </div>
    }
    @if (failed()) {
      <p role="alert">{{ 'XP.Notifications.PreferenceError' | translate }}</p>
    }
  `
})
export class OutputPreferencesComponent {
  private readonly http = inject(HttpClient)
  private readonly language = inject(TranslateService)
  private readonly url = API_PREFIX + '/user-notifications/preferences'
  readonly channels = ['in_app', 'lark'] as const
  readonly data = signal<Settings | null>(null)
  readonly selected = signal<OutputPreference | null>(null)
  readonly busy = signal(false)
  readonly open = signal(false)
  readonly failed = signal(false)
  readonly zone = new FormControl('', { nonNullable: true })
  readonly start = new FormControl('', { nonNullable: true })
  readonly end = new FormControl('', { nonNullable: true })
  readonly integration = new FormControl('', { nonNullable: true })
  chinese() {
    return this.language.currentLang?.startsWith('zh')
  }
  enabled(kind: string, channel: OutputPreference['channel']) {
    return (
      this.data()?.preferences.find((p) => p.kind === kind && p.channel === channel)?.enabled ?? channel === 'in_app'
    )
  }
  async toggle() {
    this.open.update((v) => !v)
    if (!this.open()) return
    try {
      this.failed.set(false)
      this.data.set(await firstValueFrom(this.http.get<Settings>(this.url)))
    } catch {
      this.failed.set(true)
    }
  }
  select(kind: string, channel: OutputPreference['channel']) {
    const p = this.data().preferences.find((row) => row.kind === kind && row.channel === channel) ?? {
      kind,
      channel,
      enabled: channel === 'in_app',
      quiet: null,
      integrationId: null
    }
    this.selected.set(p)
    this.zone.setValue(p.quiet?.zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
    this.start.setValue(p.quiet?.start ?? '')
    this.end.setValue(p.quiet?.end ?? '')
    this.integration.setValue(p.integrationId ?? this.data().integrations[0]?.id ?? '')
  }
  async save(enabled: boolean) {
    const p = this.selected()
    if (!p || this.busy()) return
    this.busy.set(true)
    this.failed.set(false)
    const quiet =
      enabled && (this.start.value || this.end.value)
        ? { zone: this.zone.value, start: this.start.value, end: this.end.value }
        : null
    try {
      const next = {
        ...p,
        enabled,
        quiet,
        integrationId: enabled && p.channel === 'lark' ? this.integration.value || null : null
      }
      await firstValueFrom(this.http.put(this.url, next))
      this.data.update((state) => ({
        ...state,
        preferences: [...state.preferences.filter((x) => x.kind !== p.kind || x.channel !== p.channel), next]
      }))
      this.selected.set(null)
    } catch {
      this.failed.set(true)
    } finally {
      this.busy.set(false)
    }
  }
}
