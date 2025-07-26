import { Injectable, inject, signal } from '@angular/core'
import { CalculationProperty, DataSettings, ParameterProperty } from '@metad/ocap-core'
import { EMPTY, Observable, Subject, of, switchMap } from 'rxjs'
import { NGM_DATE_VARIABLES } from '../models'

export interface EntityUpdateEvent {
  type: 'Parameter' | 'Calculation'
  dataSettings: DataSettings
  parameter?: ParameterProperty
  property?: CalculationProperty
}

@Injectable()
export class NgmOcapCoreService {
  protected dateVariables = inject(NGM_DATE_VARIABLES)

  /**
   * Receive events of creating and modifying calculated fields from each component, and send them to the component for actual update
   * Temporarily use this indirect method
   */
  readonly #entityUpdateEvent$ = new Subject<EntityUpdateEvent>()
  readonly #openCalculation = signal<(params: any) => Observable<CalculationProperty>>((params: any) => EMPTY)

  updateEntity(event: EntityUpdateEvent) {
    this.#entityUpdateEvent$.next(event)
  }

  onEntityUpdate() {
    return this.#entityUpdateEvent$.asObservable()
  }

  getDateVariables() {
    return this.dateVariables
  }

  execDateVariables(id: string): Date | [Date, Date] {
    const dateVariable = this.dateVariables.find((item) => item.id === id)
    if (!dateVariable) {
      try {
        return new Date(id)
      } catch (err) {
        throw new Error(`Can't found date variable or date '${id}'`)
      }
    }

    return dateVariable.useFactory(dateVariable.deps?.map((dep) => this.execDateVariables(dep)))
  }

  openCalculation(params) {
    return of(params).pipe(
      switchMap(this.#openCalculation())
    )
  }

  setCalculationHandler(handler: (params: any) => Observable<CalculationProperty>) {
    this.#openCalculation.set(handler)
  }
}
