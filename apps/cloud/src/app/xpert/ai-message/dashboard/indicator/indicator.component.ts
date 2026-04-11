import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { Indicator, TimeGranularity } from '@xpert-ai/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    ...ZardTooltipImports
],
  selector: 'chat-component-indicator',
  templateUrl: './indicator.component.html',
  styleUrl: 'indicator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatComponentIndicatorComponent {
  eTimeGranularity = TimeGranularity

  readonly indicator = input<Indicator>()
}
