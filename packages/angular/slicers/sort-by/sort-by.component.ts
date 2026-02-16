import { Component, Input, OnInit } from '@angular/core'
import { FormControl, FormGroup } from '@angular/forms'
import { MatFormFieldAppearance } from '@angular/material/form-field'
import { AggregationRole, EntitySet, getEntityDimensions, OrderDirection } from '@metad/ocap-core'
import { BehaviorSubject, map } from 'rxjs'

@Component({
  selector: 'ngm-sort-by',
  templateUrl: 'sort-by.component.html',
  styleUrls: ['sort-by.component.scss'],
  standalone: false
})
export class SortByComponent implements OnInit {
  AggregationRole = AggregationRole
  
  @Input() appearance: MatFormFieldAppearance = 'fill'
  @Input() get entitySet(): EntitySet {
    return this.entitySet$.value
  }
  set entitySet(value) {
    this.entitySet$.next(value)
  }
  private entitySet$ = new BehaviorSubject<EntitySet>(null)

  public dimensions$ = this.entitySet$.pipe(map((entitySet) => getEntityDimensions(entitySet?.entityType)))

  formGroup = new FormGroup({
    by: new FormControl<string>(null),
    order: new FormControl<OrderDirection>(null)
  })
  
  private onChange: (value: any) => any

  constructor() {}

  ngOnInit() {}
}
