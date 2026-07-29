import { Component, effect, input, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'

import { ActivatedRoute } from '@angular/router'
import { UsersService } from '@cloud/app/@core/state'
import { IUserUpdateInput, LanguagesEnum } from '@xpert-ai/contracts'
import { XpCommonModule } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { CreatedByPipe } from 'apps/cloud/src/app/@shared/pipes'
import { ToastrService, User } from '../../../../@core'
import { BasicInfoFormComponent, UserFormsModule } from '../../../../@shared/user/forms'
import { XpEditUserComponent } from '../edit-user/edit-user.component'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-user-basic',
  templateUrl: 'user-basic.component.html',
  styles: [
    `
      :host {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: stretch;
      }
    `
  ],
  imports: [FormsModule, TranslateModule, ZardButtonComponent, XpCommonModule, UserFormsModule]
})
export class UserBasicComponent {
  // Inputs
  readonly allowRoleChange = input<boolean>()
  readonly readOnly = input<boolean>(false)

  // Children
  readonly userBasicInfo = viewChild(BasicInfoFormComponent)

  user: User

  constructor(
    private readonly userComponent: XpEditUserComponent,
    private readonly userService: UsersService,
    private readonly route: ActivatedRoute,
    private readonly _toastrService: ToastrService
  ) {
    effect(() => {
      this.user = this.userComponent.user() as User
    })
  }

  // ngOnInit() {
  //   this.allowRoleChange = this.route.snapshot.data['allowRoleChange']
  // }

  async save() {
    if (this.readOnly()) {
      return
    }

    const { email, username, firstName, lastName, tags, preferredLanguage, imageUrl, roleId, thirdPartyId, timeZone } =
      this.user
    let request: IUserUpdateInput = {
      email,
      username,
      firstName,
      lastName,
      tags,
      preferredLanguage: preferredLanguage as LanguagesEnum,
      imageUrl,
      thirdPartyId,
      timeZone
    }

    // if (password) {
    //   request = {
    //     ...request,
    //     hash: password
    //   }
    // }

    if (this.allowRoleChange()) {
      request = {
        ...request,
        roleId
      }
    }

    try {
      await this.userService.update(this.user.id, request)
      this._toastrService.success(`XP.NOTES.USERS.USER_UPDATED`, { name: new CreatedByPipe().transform(this.user) })
      this.userBasicInfo().form.markAsPristine()
    } catch (error) {
      this._toastrService.danger(error)
    }
  }
}
