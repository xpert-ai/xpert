import { Component, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertToolset } from '../../../@core/types'
import { AvatarComponent } from '../../files'
import { SharedUiModule } from '../../ui.module'

@Component({
  standalone: true,
  imports: [FormsModule, ReactiveFormsModule, SharedUiModule, TranslateModule, AvatarComponent],
  selector: 'xp-toolset-card',
  templateUrl: 'toolset.component.html',
  styleUrls: ['toolset.component.scss']
})
export class ToolsetCard1Component {
  readonly toolset = model<IXpertToolset>()
}
