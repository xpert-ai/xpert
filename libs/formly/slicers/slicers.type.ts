import { Component, OnInit } from '@angular/core'
import { DataSettings } from '@metad/ocap-core'
import { FieldType } from '@ngx-formly/core'
import { isObservable, Observable, of } from 'rxjs'

@Component({
  selector: 'pac-formly-slicers',
  standalone: false,
  template: `
<div>{{props?.label}}</div>
<ngm-slicers editable inline
  [capacities]="props?.capacities"
  [slicers]="formControl.value"
  [dataSettings]="dataSettings$ | async"
  (valueChange)="onValueChange($event)">
</ngm-slicers>`,
  styles: [
    `
      :host {
        flex: 1;
        max-width: 100%;
      }
    `
  ]
})
export class PACFormlySlicersComponent extends FieldType implements OnInit {
  dataSettings$: Observable<DataSettings>

  ngOnInit() {
    this.dataSettings$ = isObservable(this.field.props.dataSettings)
    ? this.field.props.dataSettings as Observable<DataSettings>
    : of(this.field.props.dataSettings) as Observable<DataSettings>
  }

  onValueChange(value) {
    this.formControl.setValue(value)
  }
}
