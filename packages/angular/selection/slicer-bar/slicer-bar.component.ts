import { Component, EventEmitter, HostBinding, Inject, Input, OnInit, Optional, Output } from '@angular/core'
import { FormControl } from '@angular/forms'
import { MAT_DIALOG_DATA } from '@angular/material/dialog'
import {
  DataSettings,
  DisplayBehaviour,
  EntityType,
  ISlicer,
  Syntax,
  getEntityDimensions,
  getPropertyName,
  nonNullable
} from '@metad/ocap-core'
import { BehaviorSubject, filter, map } from 'rxjs'
import { BaseSlicersComponent } from '../base-slicers'
import { SlicersCapacity } from '../types'


@Component({
  selector: 'ngm-slicer-bar',
  templateUrl: 'slicer-bar.component.html',
  styleUrls: ['slicer-bar.component.scss'],
  standalone: false
})
export class SlicerBarComponent extends BaseSlicersComponent implements OnInit {
  DisplayBehaviour = DisplayBehaviour
  SlicersCapacity = SlicersCapacity

  @HostBinding('class.ngm-dialog-container') isDialogContainer = true

  @Input() get slicers() {
    return this.slicers$.value
  }
  set slicers(value) {
    this.slicers$.next(value)
  }
  public slicers$ = new BehaviorSubject<ISlicer[]>([])

  @Input() capacities: SlicersCapacity[]

  @Output() removed = new EventEmitter()
  @Output() valueChange = new EventEmitter<ISlicer>()

  get showCombinationSlicer() {
    return this.entityType?.syntax === Syntax.SQL && this.capacities?.includes(SlicersCapacity.CombinationSlicer)
  }
  get showAdvancedSlicer() {
    return this.entityType?.syntax === Syntax.MDX && this.capacities?.includes(SlicersCapacity.AdvancedSlicer)
  }

  public readonly dimensions$ = this.entityType$.pipe(
    filter(nonNullable),
    map(getEntityDimensions)
  )

  override readonly dateVariables = this.coreService.getDateVariables().filter((variable) => !!variable.dateRange)

  searchControl = new FormControl<string>('')
  get highlight() {
    return this.searchControl.value
  }

  constructor(
    @Optional()
    @Inject(MAT_DIALOG_DATA)
    public data?: {
      dataSettings: DataSettings
      value: ISlicer[]
      entityType: EntityType
      capacities: SlicersCapacity[]
    },
  ) {
    super()
  }

  ngOnInit() {
    if (this.data) {
      this.slicers = this.data.value
      this.entityType = this.data.entityType
      this.dataSettings = this.data.dataSettings
      this.capacities = this.data.capacities
    }
  }

  removeSelectOption(member) {
    this.removed.emit(member)
  }

  update(value, index) {
    this.slicers = [...this.slicers]
    this.slicers[index] = value
  }

  remove(index) {
    this.slicers = [...this.slicers]
    this.slicers.splice(index, 1)
  }

  override async addSlicer(slicer: ISlicer) {
    this.slicers = this.slicers ?? []

    const index = this.slicers.findIndex(
      (item) => getPropertyName(item.dimension) === getPropertyName(slicer.dimension)
    )

    if (index > -1) {
      this.update(slicer, index)
    } else {
      this.slicers = [...this.slicers, slicer]
    }
  }
}
