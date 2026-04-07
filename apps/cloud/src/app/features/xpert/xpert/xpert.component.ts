import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, computed, inject, model, signal } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { DisappearSlideLeft, OverlayAnimations } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { routeAnimations, XpertTypeEnum } from '../../../@core'
import { EmojiAvatarComponent } from '../../../@shared/avatar'
import { AppService } from '../../../app.service'
import { ExtensionHostOutletComponent } from '../../../@shared/view-extension'
import { XpertBasicManageComponent } from './manage/manage.component'
import { XpertService } from './xpert.service'
import { XpertHeaderSwitcherComponent } from './switcher/switcher.component'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    RouterModule,
    CdkMenuModule,
    NgmCommonModule,
    EmojiAvatarComponent,
    XpertBasicManageComponent,
    XpertHeaderSwitcherComponent,
    ExtensionHostOutletComponent
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
  readonly showExtensionSidebar = signal(false) // computed(() => this.xpertType() === XpertTypeEnum.Agent && !!this.xpertId())

  toggleSideMenu() {
    this.sideMenuOpened.update((state) => !state)
  }
}
