import { Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { XpDensityDirective } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule],
  selector: 'xp-file-icon',
  templateUrl: './icon.component.html',
  styleUrls: ['./icon.component.scss'],
  hostDirectives: [
    {
      directive: XpDensityDirective,
      inputs: ['small', 'large']
    }
  ]
})
export class FileIconComponent {
  // Inputs
  readonly fileType = input<string>()
  readonly directory = input<boolean>(false)
}
