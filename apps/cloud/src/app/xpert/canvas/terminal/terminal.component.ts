import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterModule } from '@angular/router'
import { TChatMessageStep, TProgramToolMessage } from '@cloud/app/@core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CdkMenuModule,
    RouterModule,
    TranslateModule,
    ...ZardTooltipImports
  ],
  selector: 'chat-canvas-terminal',
  templateUrl: './terminal.component.html',
  styleUrl: 'terminal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ChatCanvasTerminalComponent {
  readonly step = input<TChatMessageStep<TProgramToolMessage>>()

  // constructor() {
  // effect(() => {
  //   console.log(this.step())
  // })
  // }
}
