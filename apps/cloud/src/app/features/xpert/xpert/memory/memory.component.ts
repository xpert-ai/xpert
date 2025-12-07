import { A11yModule } from '@angular/cdk/a11y'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, inject } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { CopilotStoreService, injectTranslate, LongTermMemoryTypeEnum, routeAnimations } from '../../../../@core'
import { XpertService } from '../xpert.service'

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

  readonly colI18n = injectTranslate('PAC.Xpert.MemoryCols')
  readonly storeService = inject(CopilotStoreService)
  readonly xpertService = inject(XpertService)

  readonly xpertId = this.xpertService.paramId
}
