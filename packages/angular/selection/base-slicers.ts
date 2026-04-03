import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { ComponentType } from '@angular/cdk/portal'
import { booleanAttribute, Directive, inject, Input, input, signal, ViewContainerRef } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { NgmTimeFilterEditorComponent, NgmValueHelpComponent } from '@metad/ocap-angular/controls'
import { DateVariableEnum, NgmOcapCoreService } from '@metad/ocap-angular/core'
import {
  AdvancedSlicer,
  AggregationRole,
  cloneDeep,
  DataSettings,
  EntityType,
  FilterSelectionType,
  IAdvancedFilter,
  isAdvancedFilter,
  isAdvancedSlicer,
  ISlicer,
  isSemanticCalendar,
  isTimeRangesSlicer,
  Property,
  Semantics,
  TimeRange,
  VariableProperty,
  VariableSelectionType
} from '@metad/ocap-core'
import { pick } from 'lodash-es'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import { NgmAdvancedFilterComponent } from './advanced-filter'
import { NgmAdvancedSlicerComponent } from './advanced-slicer/advanced-slicer.component'
import { SlicersCapacity } from './types'

@Directive({})
export class BaseSlicersComponent {
  isSemanticCalendar = isSemanticCalendar

  public coreService = inject(NgmOcapCoreService)
  public _dialog = inject(Dialog)
  public viewContainerRef? = inject(ViewContainerRef)

  @Input() get dataSettings(): DataSettings {
    return this.dataSettings$.value
  }
  set dataSettings(value) {
    this.dataSettings$.next(value)
  }
  public dataSettings$ = new BehaviorSubject<DataSettings>(null)

  @Input() get entityType() {
    return this.entityTypeSignal()
  }
  set entityType(value) {
    this.entityTypeSignal.set(value)
  }
  readonly entityTypeSignal = signal<EntityType>(null)
  readonly entityType$ = toObservable(this.entityTypeSignal)

  readonly editable = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly dateVariables = this.coreService.getDateVariables().filter((variable) => !!variable.dateRange)

  protected openDialog<C, D, R = any>(component: ComponentType<C>, data: D): DialogRef<R, C> {
    return this._dialog.open<R, D, C>(component, {
      viewContainerRef: this.viewContainerRef,
      data,
      backdropClass: 'xp-overlay-share-sheet',
      panelClass: 'xp-overlay-pane-share-sheet'
    })
  }

  async openSlicerCreator(property: Property | VariableProperty | SlicersCapacity) {
    const entityType = this.entityType

    if (property === SlicersCapacity.CombinationSlicer) {
      const combinationSlicer: IAdvancedFilter = await firstValueFrom(
        this.openDialog(NgmAdvancedFilterComponent, {
          dataSettings: this.dataSettings,
          entityType: entityType,
          syntax: entityType.syntax
        }).closed
      )
      if (combinationSlicer) {
        await this.addSlicer(combinationSlicer)
      }
    } else if (property === SlicersCapacity.AdvancedSlicer) {
      const advancedSlicer: AdvancedSlicer = await firstValueFrom(
        this.openDialog(NgmAdvancedSlicerComponent, {
          dataSettings: {
            ...this.dataSettings
          }
        }).closed
      )
      if (advancedSlicer) {
        await this.addSlicer(advancedSlicer)
      }
    } else if (property === SlicersCapacity.Variable) {
      //
    } else {
      if (property.semantics?.semantic === Semantics.Calendar) {
        await this.openDynamicDateHelp(property)
      } else {
        await this.openValueHelp(property)
      }
    }
  }

  /**
   * Open dialog for create dynamic date ranges of dimension
   *
   * @param property property of dimension
   * @param variable dynamic time variable
   */
  async openDynamicDateHelp(property: Property, variable?: TimeRange) {
    const timeRangesSlicer = await firstValueFrom(
      this.openDialog(NgmTimeFilterEditorComponent, {
        currentDate: 'SYSTEMTIME',
        dataSettings: this.dataSettings,
        entityType: this.entityType,
        slicer: {
          dimension: {
            dimension: property.name
          },
          currentDate: DateVariableEnum.TODAY,
          ranges: variable ? [variable] : []
        }
      }).closed
    )

    if (timeRangesSlicer) {
      this.addSlicer(timeRangesSlicer)
    }
  }

  async addSlicer(slicer: ISlicer) {
    //
  }

  /**
   * Open value help dialog of property for select members
   *
   * @param property dimension property
   */
  async openValueHelp(property: Property | VariableProperty) {
    const dimension =
      property.role === AggregationRole.variable
        ? {
            dimension: (property as VariableProperty).referenceDimension,
            parameter: property.name
          }
        : {
            dimension: property.name
          }
    const selectionType =
      property.role === AggregationRole.variable
        ? (property as VariableProperty).variableSelectionType === VariableSelectionType.Value
          ? FilterSelectionType.Single
          : FilterSelectionType.Multiple
        : FilterSelectionType.Multiple
    const slicer = await firstValueFrom(
      this.openDialog(NgmValueHelpComponent, {
        dataSettings: pick(this.dataSettings, ['dataSource', 'entitySet']),
        dimension,
        options: {
          selectionType,
          searchable: true,
          initialLevel: 1
        }
      }).closed
    )
    if (slicer) {
      await this.addSlicer({ ...slicer } as ISlicer)
    }
  }

  async openSlicerEditor(slicer: ISlicer) {
    if (isAdvancedFilter(slicer)) {
      return await firstValueFrom(
        this.openDialog(NgmAdvancedFilterComponent, {
          dataSettings: this.dataSettings,
          entityType: this.entityType,
          syntax: this.entityType.syntax,
          advancedFilter: cloneDeep(slicer)
        }).closed
      )
    } else if (isAdvancedSlicer(slicer)) {
      return await firstValueFrom(
        this.openDialog(NgmAdvancedSlicerComponent, {
          dataSettings: this.dataSettings,
          // coreService: this.coreService,
          model: slicer
        }).closed
      )
    } else if (isTimeRangesSlicer(slicer)) {
      return await firstValueFrom(
        this.openDialog(NgmTimeFilterEditorComponent, {
          entityType: this.entityType,
          slicer
        }).closed
      )
    } else {
      const dialogRef = this.openDialog(NgmValueHelpComponent, {
        dimension: pick(slicer?.dimension, 'dimension', 'hierarchy', 'displayBehaviour'),
        slicer: slicer,
        dataSettings: this.dataSettings,
        options: {
          selectionType: slicer.selectionType,
          searchable: true,
          initialLevel: 1
        }
      })

      return await firstValueFrom(dialogRef.closed)
    }
  }
}
