import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { DisappearSlideLeft, OverlayAnimations } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { routeAnimations, XpertTypeEnum } from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { AppService } from '../../../app.service'
import { XpertBasicManageComponent } from './manage/manage.component'
import { XpertService } from './xpert.service'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,

    NgmCommonModule,
    EmojiAvatarComponent,
    XpertBasicManageComponent
  ],
  selector: 'xp-xpert',
  templateUrl: './xpert.component.html',
  styleUrl: 'xpert.component.scss',
  animations: [routeAnimations, ...OverlayAnimations, DisappearSlideLeft],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [XpertService]
})
export class XpertComponent {
  eXpertTypeEnum = XpertTypeEnum

  readonly appService = inject(AppService)
  readonly xpertService = inject(XpertService)

  readonly xpertId = this.xpertService.paramId
  readonly paramId = this.xpertService.paramId
  readonly isMobile = this.appService.isMobile
  readonly sideMenuOpened = model(!this.isMobile())
  readonly manageOpened = signal(false)
  readonly xpert = this.xpertService.xpert
  readonly latestXpert = this.xpertService.latestXpert

  readonly avatar = computed(() => this.xpert()?.avatar)
  readonly xpertType = computed(() => this.xpert()?.type)

  toggleSideMenu() {
    this.sideMenuOpened.update((state) => !state)
  }
}
