import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  injectApiBaseUrl,
  injectToastr,
  routeAnimations,
  TChatApp,
  XpertService
} from '../../../../@core'
import { EmojiAvatarComponent } from '../../../../@shared/avatar'
import { XpertComponent } from '../xpert.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    EmojiAvatarComponent,
    MatTooltipModule,
    NgmSpinComponent,
  ],
  selector: 'xpert-monitor',
  templateUrl: './monitor.component.html',
  styleUrl: 'monitor.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMonitorComponent {
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()
  readonly xpertComponent = inject(XpertComponent)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly webBaseUrl = injectApiBaseUrl()

  readonly xpert = this.xpertComponent.latestXpert

  readonly avatar = computed(() => this.xpert()?.avatar)
  readonly appUrl = computed(() => window.location.origin + '/x/' + this.xpert()?.slug)
  readonly app = computed(() => this.xpert()?.app)
  readonly enabledApp = computed(() => this.app()?.enabled)

  readonly loading = signal(false)

  preview() {
    window.open(this.appUrl(), '_blank')
  }

  updateApp(value: Partial<TChatApp>) {
    this.loading.set(true)
    const app = { ...(this.app() ?? {}), ...value}
    this.xpertService.updateChatApp(this.xpert().id, app).subscribe({
      next: () => {
        this.loading.set(false)
        this.xpertComponent.latestXpert.update((state) => ({...state, app}))
      },
      error: (err) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }
}
