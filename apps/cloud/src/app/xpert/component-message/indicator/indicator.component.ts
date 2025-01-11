import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { RouterModule } from '@angular/router'
import { Indicator, TimeGranularity } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    MatTooltipModule
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
