import { A11yModule } from '@angular/cdk/a11y'
import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  CopilotStoreService,
  injectToastr,
  injectTranslate,
  LongTermMemoryTypeEnum,
  routeAnimations,
  XpertAPIService
} from '../../../../@core'
import { XpertComponent } from '../xpert.component'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, TranslateModule, RouterModule, A11yModule, CdkMenuModule],
  selector: 'xp-xpert-memory',
  templateUrl: './memory.component.html',
  styleUrl: 'memory.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class XpertMemoryComponent {
  eLongTermMemoryTypeEnum = LongTermMemoryTypeEnum

  readonly #translate = inject(TranslateService)
  readonly colI18n = injectTranslate('PAC.Xpert.MemoryCols')
  readonly #dialog = inject(Dialog)
  readonly #toastr = injectToastr()
  readonly storeService = inject(CopilotStoreService)
  readonly xpertService = inject(XpertAPIService)
  readonly xpertComponent = inject(XpertComponent)
  readonly #clipboard = inject(Clipboard)

  readonly xpertId = this.xpertComponent.paramId
}
