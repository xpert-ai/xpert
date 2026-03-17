
import { Component, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertToolset } from '../../../@core/types'
import { AvatarComponent } from '../../files'
import { SharedUiModule } from '../../ui.module'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    SharedUiModule,
    TranslateModule,
    ButtonGroupDirective,
    DensityDirective,
    AvatarComponent
],
  selector: 'pac-toolset-card',
  templateUrl: 'toolset.component.html',
  styleUrls: ['toolset.component.scss']
})
export class ToolsetCard1Component {
  readonly toolset = model<IXpertToolset>()
}
