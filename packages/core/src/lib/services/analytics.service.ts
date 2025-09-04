import { combineLatestWith, distinctUntilChanged, filter, map, Observable } from 'rxjs'
import { t } from 'i18next'
import { AnalyticsAnnotation } from '../annotations'
import { getEntityHierarchy, getEntityProperty, QueryReturn } from '../models'
import { isBaseProperty, isMeasure, QueryOptions } from '../types'
import { isEmpty, nonNullable } from '../utils'
import { SmartBusinessService } from './smart-business.service'

export class AnalyticsBusinessService<T> extends SmartBusinessService<T> {
  
  public readonly analyticsAnnotation$ = this.dataSettings$.pipe(
    map((dataSettings) => dataSettings?.analytics),
    distinctUntilChanged()
  )

  get analyticsAnnotation() {
    return this.get((state) => state.dataSettings?.analytics)
  }

  /**
   * Analytics annotations after merging corresponding Entity Properties
   */
  public readonly analytics$ = this.analyticsAnnotation$.pipe(
    filter(nonNullable),
    combineLatestWith(this.selectEntityType()),
    map(([analyticsAnnotation, entityType]) => {
      return {
        rows: analyticsAnnotation.rows?.filter(isBaseProperty).map((item) => ({
          ...item,
          property: isMeasure(item) ? getEntityProperty(entityType, item) : getEntityHierarchy(entityType, item)
        })),
        columns: analyticsAnnotation.columns?.filter(isBaseProperty).map((item) => ({
          ...item,
          property: isMeasure(item) ? getEntityProperty(entityType, item) : getEntityHierarchy(entityType, item)
        }))
      } as AnalyticsAnnotation
    })
  )

  override onInit(): Observable<any> {
    return super.onInit().pipe(
      map((dataSettings) => dataSettings.analytics),
      filter((analytics) => this.isMeetRequired(analytics))
    )
  }

  override selectQuery(options?: QueryOptions<any>): Observable<QueryReturn<T>> {
    const analyticsAnnotation = {
      ...this.analyticsAnnotation,
      rows: this.analyticsAnnotation?.rows?.filter(isBaseProperty),
      columns: this.analyticsAnnotation?.columns?.filter(isBaseProperty)
    }

    if (!this.isMeetRequired(analyticsAnnotation)) {
      throw new Error(t('Error.NoAnalyticsRowsOrColumns', {ns: 'core'}))
    }
    options = options ?? {}
    options.rows = analyticsAnnotation.rows
    options.columns = analyticsAnnotation.columns
    return super.selectQuery(options)
  }

  protected isMeetRequired(analytics: AnalyticsAnnotation) {
    return !isEmpty(analytics?.rows?.filter(isBaseProperty)) || !isEmpty(analytics?.columns?.filter(isBaseProperty))
  }
}
