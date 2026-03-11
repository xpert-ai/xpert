import { Component, HostBinding, OnInit } from '@angular/core'
import { UntypedFormControl, UntypedFormGroup, Validators } from '@angular/forms'
import { MatDialogRef } from '@angular/material/dialog'
import { MatSnackBar } from '@angular/material/snack-bar'
import { mergeSelectedValues } from '@metad/ocap-angular/core'
import { isEmpty } from 'lodash-es'
import { BehaviorSubject, combineLatest, map, startWith } from 'rxjs'
import { convertConfigurationSchema, IMG_ROOT, PACNotificationDestinationsService } from '../../../../@core'

@Component({
  selector: 'pac-new-notification-destination',
  templateUrl: './new-notification-destination.component.html',
  styleUrls: ['./new-notification-destination.component.scss']
})
export class NewNotificationDestinationComponent implements OnInit {
  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  IMG_ROOT = IMG_ROOT
  destinationTypes$ = this.destinationService.getTypes()
  typeFormGroup = new UntypedFormGroup({
    type: new UntypedFormControl(null, [Validators.required])
  })
  readonly destinationTypesWithSelection$ = combineLatest([
    this.destinationTypes$,
    this.typeFormGroup.valueChanges.pipe(startWith(this.typeFormGroup.value))
  ]).pipe(map(([types, value]) => mergeSelectedValues(types, value?.type ?? [], this.compareWithType)))

  get type() {
    return this.typeFormGroup.value?.type?.[0]
  }

  configurationFormGroup = new UntypedFormGroup({
    name: new UntypedFormControl(null, [Validators.required]),
    options: new UntypedFormGroup({})
  })
  get nameCtrl() {
    return this.configurationFormGroup.get('name')
  }
  get options() {
    return this.configurationFormGroup.get('options') as UntypedFormGroup
  }

  model = {}
  fields$ = new BehaviorSubject([])

  creating: boolean
  constructor(
    private destinationService: PACNotificationDestinationsService,
    private _dialogRef: MatDialogRef<NewNotificationDestinationComponent>,
    private _snakBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.typeFormGroup.valueChanges.subscribe(({ type }) => {
      if (!isEmpty(type)) {
        this.fields$.next(convertConfigurationSchema(type[0].schema))
        setTimeout(() => {
          this.model = {}
          this.onReset()
        })
      }
    })
  }

  onSave() {
    this.creating = true
    this.destinationService
      .create({
        ...this.configurationFormGroup.value,
        type: this.type.type
      })
      .subscribe(() => {
        this._snakBar.open('创建成功', '', { duration: 1000 })
        this._dialogRef.close()
      })
  }

  onReset() {
    this.configurationFormGroup.clearValidators()
    this.configurationFormGroup.reset()
  }

  compareWithType(a: any, b: any) {
    return a?.type === b?.type
  }
}
