import { Injectable } from '@angular/core'
import { NgmDSCoreService } from '@xpert-ai/ocap-angular/core'
import { C_MEASURES, QueryOptions, QueryReturn, SmartBusinessService } from '@xpert-ai/ocap-core'
import { BehaviorSubject, Observable, combineLatest, map, switchMap } from 'rxjs'

@Injectable()
export class TextDataService extends SmartBusinessService<unknown> {

  private readonly measures$ = new BehaviorSubject<string[]>([])

  constructor(dsCoreService: NgmDSCoreService) {
    super(dsCoreService)
  }

  setMeasures(measures: string[]) {
    this.measures$.next(measures)
  }

  selectQuery(options?: QueryOptions<any>): Observable<QueryReturn<unknown>> {
    return this.measures$.pipe(
      switchMap((measures) => {
        return combineLatest(
          measures.map((measure) => {
            return super
              .selectQuery({
                ...options,
                columns: [
                  {
                    dimension: C_MEASURES,
                    measure
                  }
                ]
              })
              .pipe(
                map((result) => ({
                  ...result,
                  measure
                }))
              )
          })
        ).pipe(
          map((results) => ({
            data: results,
            error: results.find((result) => !!result.error)?.error
          }))
        )
      })
    )
  }
}
