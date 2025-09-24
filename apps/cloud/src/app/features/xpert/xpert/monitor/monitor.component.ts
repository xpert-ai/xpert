import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { OverlayAnimations } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmTooltipDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { InDevelopmentComponent } from 'apps/cloud/src/app/@theme'
import { injectApiBaseUrl, injectToastr, routeAnimations, XpertAPIService } from '../../../../@core'
import { XpertAPIComponent } from '../api/api.component'
import { XpertAppComponent } from '../app/app.component'
import { XpertComponent } from '../xpert.component'
import { XpertStatisticsComponent } from './statistics/statistics.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,
    MatTooltipModule,
    NgmSpinComponent,
    NgmTooltipDirective,
    InDevelopmentComponent,
    XpertAppComponent,
    XpertAPIComponent,
    XpertStatisticsComponent
  ],
  selector: 'xpert-monitor',
  templateUrl: './monitor.component.html',
  styleUrl: 'monitor.component.scss',
  animations: [routeAnimations, ...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMonitorComponent {
  readonly xpertService = inject(XpertAPIService)
  readonly #toastr = injectToastr()
  readonly xpertComponent = inject(XpertComponent)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #clipboard = inject(Clipboard)
  readonly #dialog = inject(Dialog)
  readonly apiBaseUrl = injectApiBaseUrl()

  readonly xpert = this.xpertComponent.latestXpert

  readonly loading = signal(false)

  copy(content: string) {
    this.#clipboard.copy(content)
    this.#toastr.info({ code: 'PAC.Xpert.Copied', default: 'Copied' })
  }
}
