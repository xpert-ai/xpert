import { CommonModule } from '@angular/common'
import { Component, Inject } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import {
  ZardButtonComponent,
  ZardComboboxComponent,
  ZardComboboxOptionTemplateDirective,
  ZardFormImports,
  ZardIconComponent,
  ZardLoaderComponent,
  ZardChipsImports,
  type ZardComboboxOption,
  Z_MODAL_DATA,
  ZardDialogRef
} from '@xpert-ai/headless-ui'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, ISelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, debounceTime, EMPTY, filter, map, of, switchMap, tap } from 'rxjs'
import { EmployeesService, IEmployee } from '../../../@core'
import { userLabel } from '../../pipes'
import { SharedModule } from '../../shared.module'

@Component({
  standalone: true,
  imports: [
    SharedModule,
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ZardButtonComponent,
    ZardComboboxComponent,
    ZardComboboxOptionTemplateDirective,
    ...ZardFormImports,
    ...ZardChipsImports,
    ZardIconComponent,
    ZardLoaderComponent,
    TranslateModule,
    ButtonGroupDirective,
    NgmCommonModule
  ],
  selector: 'pac-employee-search',
  templateUrl: 'employee-search.component.html',
  styleUrls: ['employee-search.component.scss']
})
export class EmployeeSelectComponent {
  private skipNextSearchTermSync = false
  userLabel = userLabel

  role = null
  users: IEmployee[] = []
  loading = false
  searchControl = new FormControl<string>('')

  public readonly users$ = this.searchControl.valueChanges.pipe(
    debounceTime(500),
    filter((value) => typeof value === 'string'),
    switchMap((text) => {
      if (text.trim()) {
        this.loading = true
        return this.employeeService.search(text).pipe(
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
  public readonly userOptions$ = this.users$.pipe(
    map((items) =>
      items.map((user) => ({
        id: user.id,
        label: userLabel(user.user),
        value: user,
        data: user
      }))
    )
  )

  constructor(
    @Inject(Z_MODAL_DATA)
    public data: { role: string; roles: ISelectOption[] },
    private _dialogRef: ZardDialogRef<EmployeeSelectComponent>,
    private employeeService: EmployeesService
  ) {
    this.role = data?.role
  }

  remove(user: IEmployee): void {
    const index = this.users.indexOf(user)
    if (index >= 0) {
      this.users.splice(index, 1)
    }
  }

  onSearchTermChange(value: string) {
    if (this.skipNextSearchTermSync) {
      this.skipNextSearchTermSync = false
      this.searchControl.setValue('', { emitEvent: false })
      return
    }

    this.searchControl.setValue(value)
  }

  selected(value: unknown): void {
    const user = value as IEmployee | null
    if (user && !this.users.find((item) => item.id === user.id)) {
      this.users.push(user)
    }
    this.resetSearch()
  }

  displayUser(_option: ZardComboboxOption | null, value: unknown) {
    return value ? userLabel((value as IEmployee).user) : ''
  }

  onApply() {
    this._dialogRef.close({
      role: this.role,
      employees: this.users
    })
  }

  private resetSearch() {
    this.skipNextSearchTermSync = true
    this.searchControl.setValue('', { emitEvent: false })
  }
}
