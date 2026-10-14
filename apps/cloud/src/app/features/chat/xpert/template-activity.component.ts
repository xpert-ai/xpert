import { Component, input, inject, signal, effect, output } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import type { TemplateActivity } from '@xpert-ai/contracts'
import { firstValueFrom } from 'rxjs'
import { getErrorMessage } from '../../../@core'
import { API_XPERT_ROLE } from '../../../@core/constants/app.constants'

@Component({
  selector: 'xp-template-activity',
  standalone: true,
  imports: [RouterModule, TranslateModule, ZardButtonComponent],
  template: `<section class="space-y-3 border-t border-divider-regular pt-4">
    <h3 class="font-medium">
      {{ 'TemplateActivity.Title' | translate }} · {{ activity()?.unread ?? 0 }}
      {{ 'TemplateActivity.Unread' | translate }}
    </h3>
    @if (error()) {
      <p role="alert" class="text-text-destructive">{{ error() }}</p>
    }
    @if (activity()?.items?.length === 0) {
      <p class="text-text-secondary">{{ 'TemplateActivity.Empty' | translate }}</p>
    }
    @for (item of activity()?.items ?? []; track item.id) {
      <div class="space-y-2 border-b border-divider-regular pb-3">
        <p>
          {{ item.routine }} · {{ 'TemplateActivity.Status.' + item.status | translate }}
          @if (item.unread) {
            · {{ 'TemplateActivity.Unread' | translate }}
          }
        </p>
        <p class="text-xs text-text-secondary">{{ item.scheduledAt }}</p>
        @if (item.reason) {
          <p class="text-text-secondary">{{ item.reason }}</p>
        }
        <div class="flex items-center gap-3">
          @if (item.threadId) {
            <a
              class="text-primary underline"
              [routerLink]="['/chat/x', activity().assistantName, 'c', item.threadId]"
              (click)="opened.emit()"
              >{{ 'TemplateActivity.Open' | translate }}</a
            >
          }
          @if (item.unread) {
            <button z-button zType="ghost" type="button" (click)="read(item.key)">
              {{ 'TemplateActivity.Read' | translate }}
            </button>
          }
        </div>
      </div>
    }
  </section>`
})
export class TemplateActivityComponent {
  readonly assistantId = input.required<string>()
  readonly opened = output<void>()
  readonly http = inject(HttpClient)
  readonly activity = signal<TemplateActivity | null>(null)
  readonly error = signal('')
  constructor() {
    effect((cleanup) => {
      const id = this.assistantId()
      let active = true
      let pending = false
      const refresh = async () => {
        if (pending) return
        pending = true
        try {
          const value = await firstValueFrom(
            this.http.get<TemplateActivity>(`${API_XPERT_ROLE}/${id}/template-setup/activity`)
          )
          if (active) {
            this.activity.set(value)
            this.error.set('')
          }
        } catch (error) {
          if (active) this.error.set(getErrorMessage(error))
        } finally {
          pending = false
        }
      }
      void refresh()
      const timer = setInterval(refresh, 15000)
      cleanup(() => {
        active = false
        clearInterval(timer)
      })
    })
  }
  async read(key: string) {
    try {
      this.activity.set(
        await firstValueFrom(
          this.http.put<TemplateActivity>(`${API_XPERT_ROLE}/${this.assistantId()}/template-setup/activity/read`, {
            keys: [key]
          })
        )
      )
      this.error.set('')
    } catch (error) {
      this.error.set(getErrorMessage(error))
    }
  }
}
