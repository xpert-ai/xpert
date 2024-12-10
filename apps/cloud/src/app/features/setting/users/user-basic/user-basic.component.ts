import { Component, Input, OnInit, ViewChild, effect } from '@angular/core'
import { ActivatedRoute } from '@angular/router'
import { UsersService } from '@metad/cloud/state'
import { IUserUpdateInput, LanguagesEnum } from '@metad/contracts'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { ToastrService, User } from '../../../../@core'
import { BasicInfoFormComponent, UserFormsModule } from '../../../../@shared/user/forms'
import { PACEditUserComponent } from '../edit-user/edit-user.component'
import { TranslationBaseComponent } from 'apps/cloud/src/app/@shared/language'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { SharedModule } from 'apps/cloud/src/app/@shared/shared.module'
import { CreatedByPipe } from 'apps/cloud/src/app/@shared/pipes'

@Component({
  standalone: true,
  selector: 'pac-user-basic',
  templateUrl: 'user-basic.component.html',
  styles: [
    `
      :host {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
    `
  ],
  imports: [SharedModule, MaterialModule, NgmCommonModule, UserFormsModule]
})
export class UserBasicComponent extends TranslationBaseComponent {
  @Input() allowRoleChange: boolean

  @ViewChild('userBasicInfo') userBasicInfo: BasicInfoFormComponent

  user: User

  constructor(
    private readonly userComponent: PACEditUserComponent,
    private readonly userService: UsersService,
    private readonly route: ActivatedRoute,
    private readonly _toastrService: ToastrService
  ) {
    super()

    effect(() => {
      this.user = this.userComponent.user() as User
    })
  }

  // ngOnInit() {
  //   this.allowRoleChange = this.route.snapshot.data['allowRoleChange']
  // }

  async save() {
    const { email, username, firstName, lastName, tags, preferredLanguage, password, imageUrl, roleId } = this.user
    let request: IUserUpdateInput = {
      email,
      username,
      firstName,
      lastName,
      tags,
      preferredLanguage: preferredLanguage as LanguagesEnum,
      imageUrl
    }

    if (password) {
      request = {
        ...request,
        hash: password
      }
    }

    if (this.allowRoleChange) {
      request = {
        ...request,
        roleId: this.user.roleId
      }
    }

    try {
      await this.userService.update(this.user.id, request)
      this._toastrService.success(`PAC.NOTES.USERS.USER_UPDATED`, { name: new CreatedByPipe().transform(this.user) })
      this.userBasicInfo.form.markAsPristine()
    } catch (error) {
      this._toastrService.danger(error)
    }
  }
}
