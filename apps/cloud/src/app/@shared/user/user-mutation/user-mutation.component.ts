import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { ChangeDetectionStrategy, Component, HostBinding, inject, Inject, Input, OnInit, ViewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { ITag, IUser } from '@metad/contracts'
import { ButtonGroupDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ToastrService } from '../../../@core'
import { Store } from '../../../@core/services/store.service'
import { BasicInfoFormComponent, UserFormsModule } from '../forms'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    DragDropModule,
    TranslateModule,
    ButtonGroupDirective,

    UserFormsModule
  ],
  selector: 'pac-user-mutation',
  templateUrl: './user-mutation.component.html',
  styleUrls: ['./user-mutation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserMutationComponent implements OnInit {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  readonly dialogRef = inject(DialogRef<{ user: IUser }, UserMutationComponent>)

  @ViewChild('userBasicInfo')
  userBasicInfo: BasicInfoFormComponent
  tags: ITag[]
  selectedTags: any

  /** Form validity from child; used for Apply button (works with OnPush) */
  formValid = false

  @Input() public isAdmin: boolean
  @Input() public isSuperAdmin: boolean

  constructor(
    protected store: Store,
    @Inject(DIALOG_DATA)
    private data: { isAdmin: boolean; isSuperAdmin: boolean },
    private toastrService: ToastrService
  ) {}

  ngOnInit(): void {
    this.isAdmin = this.data.isAdmin
    this.isSuperAdmin = this.data.isSuperAdmin
  }
  
  selectedTagsEvent(ev) {
    this.tags = ev
  }

  closeDialog(user: IUser = null) {
    this.dialogRef.close({ user })
  }

  cancel() {
    this.dialogRef.close()
  }

  async add() {
    try {
      const organization = this.store.selectedOrganization
      const user = await this.userBasicInfo.registerUser(organization?.id, this.store.userId)
      this.closeDialog(user)
    } catch (error) {
      this.toastrService.danger(error)
    }
  }
}
