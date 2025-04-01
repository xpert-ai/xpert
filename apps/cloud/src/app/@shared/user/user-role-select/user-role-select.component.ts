import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { COMMA, ENTER } from '@angular/cdk/keycodes'
import { CommonModule } from '@angular/common'
import { Component, ElementRef, inject, Input, ViewChild } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'
import { MatButtonModule } from '@angular/material/button'
import { MatChipsModule } from '@angular/material/chips'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { MatRadioModule } from '@angular/material/radio'
import { UsersService } from '@metad/cloud/state'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, ISelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, debounceTime, EMPTY, filter, of, switchMap, tap } from 'rxjs'
import { IUser } from '../../../@core'
import { userLabel, UserPipe } from '../../pipes'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,

    MatButtonModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    TranslateModule,

    ButtonGroupDirective,
    NgmCommonModule,
    UserPipe
  ],
  selector: 'pac-user-role-select',
  templateUrl: 'user-role-select.component.html',
  styleUrls: ['user-role-select.component.scss']
})
export class UserRoleSelectComponent {
  separatorKeysCodes: number[] = [ENTER, COMMA]
  userLabel = userLabel

  private userService = inject(UsersService)
  public data: { role: string; roles: ISelectOption[]; single?: boolean } = inject(DIALOG_DATA)
  private _dialogRef = inject(DialogRef)

  @Input() single: boolean

  role: string = null
  users: IUser[] = []
  loading = false
  searchControl = new FormControl()
  @ViewChild('userInput') userInput: ElementRef<HTMLInputElement>

  public readonly users$ = this.searchControl.valueChanges.pipe(
    debounceTime(500),
    filter((value) => typeof value === 'string'),
    switchMap((text) => {
      if (text.trim()) {
        this.loading = true
        return this.userService.search(text).pipe(
          catchError((err) => {
            this.loading = false
            return EMPTY
          })
        )
      }
      return of([])
    }),
    tap((items) => (this.loading = false))
  )

  constructor() {
    this.role = this.data?.role
    this.single = this.data?.single
  }

  displayWith(user: IUser) {
    if (user === null) {
      return null
    }
    return user.fullName || user.firstName + user.firstName || user.email
  }

  remove(user: IUser): void {
    const index = this.users.indexOf(user)

    if (index >= 0) {
      this.users.splice(index, 1)
    }
  }

  selected(event: MatAutocompleteSelectedEvent): void {
    if (event.option.value && !this.users.find((item) => item.id === event.option.value.id)) {
      if (this.single) {
        this.users = [event.option.value]
      } else {
        this.users.push(event.option.value)
      }
    }
    this.userInput.nativeElement.value = ''
    this.searchControl.setValue(null)
  }

  onPaste(event: ClipboardEvent) {
    // todo
    // // 获取粘贴的文本内容
    // const pastedText = event.clipboardData.getData('text');

    // const pastedLines = pastedText.split('\n');
    // pastedLines.forEach(line => {
    //   // 查找与每行粘贴内容匹配的选项（忽略大小写）
    //   const matchingOption = this.options.find(option => 
    //     option.toLowerCase() === line.toLowerCase().trim()
    //   );

    //   if (matchingOption) {
    //     // 如果找到匹配项，插入选项
    //     this.insertOption(matchingOption);
    //   } else {
    //     // 如果没有匹配项，可以选择不处理或提示用户
    //     console.log('未找到匹配的选项:', line);
    //   }
    // });

    // // 阻止默认粘贴行为（可选）
    // event.preventDefault();
  }

  onApply() {
    this._dialogRef.close({
      role: this.role,
      users: this.users
    })
  }

  onCancel() {
    this._dialogRef.close()
  }
}
