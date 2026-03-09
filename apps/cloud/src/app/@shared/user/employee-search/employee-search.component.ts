import { COMMA, ENTER } from '@angular/cdk/keycodes'
import { CommonModule } from '@angular/common'
import { Component, ElementRef, Inject, OnInit, ViewChild } from '@angular/core'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete'

import { MatChipsModule } from '@angular/material/chips'
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog'
import { MatFormFieldModule } from '@angular/material/form-field'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, ISelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { catchError, debounceTime, EMPTY, filter, of, switchMap, tap } from 'rxjs'
import { EmployeesService, IEmployee } from '../../../@core'
import { userLabel } from '../../pipes'
import { SharedModule } from '../../shared.module'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    SharedModule,

    CommonModule,
    FormsModule,
    ReactiveFormsModule,

    MatDialogModule,
    ZardButtonComponent,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatIconModule,
    MatProgressSpinnerModule,

    TranslateModule,

    ButtonGroupDirective,

    NgmCommonModule
  ],
  selector: 'pac-employee-search',
  templateUrl: 'employee-search.component.html',
  styleUrls: ['employee-search.component.scss']
})
export class EmployeeSelectComponent {
  separatorKeysCodes: number[] = [ENTER, COMMA]
  userLabel = userLabel

  role = null
  users: IEmployee[] = []
  loading = false
  searchControl = new FormControl()

  @ViewChild('userInput') userInput: ElementRef<HTMLInputElement>

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

  constructor(
    @Inject(MAT_DIALOG_DATA)
    public data: { role: string; roles: ISelectOption[] },
    private _dialogRef: MatDialogRef<EmployeeSelectComponent>,
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

  selected(event: MatAutocompleteSelectedEvent): void {
    if (event.option.value && !this.users.find((item) => item.id === event.option.value.id)) {
      this.users.push(event.option.value)
    }
    this.userInput.nativeElement.value = ''
    this.searchControl.setValue(null)
  }

  onApply() {
    this._dialogRef.close({
      role: this.role,
      employees: this.users
    })
  }
}
