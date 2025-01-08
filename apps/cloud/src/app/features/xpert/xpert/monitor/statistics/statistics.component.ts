import { Clipboard } from '@angular/cdk/clipboard'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  getErrorMessage,
  injectToastr,
  routeAnimations,
  TChatApp,
  XpertService,
  injectApiBaseUrl,
  TChatApi
} from '../../../../../@core'
import { EmojiAvatarComponent } from '../../../../../@shared/avatar'
import { XpertComponent } from '../../xpert.component'
import { InDevelopmentComponent } from 'apps/cloud/src/app/@theme'
import { NgmTooltipDirective } from '@metad/ocap-angular/core'
import { OverlayAnimations } from '@metad/core'
import { CdkMenuModule } from '@angular/cdk/menu'
import { Dialog } from '@angular/cdk/dialog'
import { derivedAsync } from 'ngxtension/derived-async'
import { of } from 'rxjs'
import { subDays } from 'date-fns'
import { XpertStatisticsChartComponent } from '../chart/chart.component'
import { CertificationSelectComponent } from "../../../../../@shared/certification/certification-select.component";

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
    XpertStatisticsChartComponent,
    CertificationSelectComponent
],
  selector: 'xpert-statistics',
  templateUrl: './statistics.component.html',
  styleUrl: 'statistics.component.scss',
  animations: [...OverlayAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertStatisticsComponent {
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()
  readonly xpertComponent = inject(XpertComponent)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #clipboard = inject(Clipboard)
  readonly #dialog = inject(Dialog)
  readonly apiBaseUrl = injectApiBaseUrl()

  readonly xpert = this.xpertComponent.latestXpert
  readonly xpertId = computed(() => this.xpert()?.id)

  readonly timeRange = signal<[string, string]>([subDays(new Date(), 7).toISOString(), new Date().toISOString(),])

  readonly dailyConv = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getDailyConversations(this.xpertId(), this.timeRange()) : of(null)
  })

  readonly dailyEndUsers = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getDailyEndUsers(this.xpertId(), this.timeRange()) : of(null)
  })
  
  readonly averageSessionInteractions = derivedAsync(() => {
    return this.xpertId() ? this.xpertService.getAverageSessionInteractions(this.xpertId(), this.timeRange()) : of(null)
  })

}
