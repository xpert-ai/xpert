
import { Component, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmDensityDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule],
  selector: 'pac-file-icon',
  templateUrl: './icon.component.html',
  styleUrls: ['./icon.component.scss'],
  hostDirectives: [
    {
      directive: NgmDensityDirective,
      inputs: ['small', 'large'],
    }
  ]
})
export class FileIconComponent {
  // Inputs
  readonly fileType = input<string>()
  readonly directory = input<boolean>(false)
}
