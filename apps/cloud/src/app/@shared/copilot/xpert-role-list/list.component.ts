import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, input, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatIconModule } from '@angular/material/icon'
import { DensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpertRole } from '../../../@core/types'
import { AvatarComponent } from '../../files'

/**
 * @deprecated
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CdkListboxModule,
    TranslateModule,
    MatIconModule,
    DensityDirective,
    AvatarComponent
  ],
  selector: 'pac-xpert-role-list',
  templateUrl: 'list.component.html',
  styleUrls: ['list.component.scss']
})
export class XpertRoleListComponent {
  readonly roleList = input<IXpertRole[]>()

  readonly roles = model()

  compareId(a: IXpertRole, b: IXpertRole): boolean {
    return a?.id === b?.id
  }
}
