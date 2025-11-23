import { inject } from "@angular/core"
import { convertNewSemanticModelResult, IIndicator, SemanticModelServerService } from "@metad/cloud/state"
import { omitBlank } from "@metad/ocap-angular/core"
import { pick } from "lodash-es"
import { map } from "rxjs/operators"

export const INDICATOR_AGGREGATORS = [
  {
    value: null,
    label: '无'
  },
  {
    value: 'sum',
    label: 'SUM'
  },
  {
    value: 'count',
    label: 'COUNT'
  },
  {
    value: 'min',
    label: 'MIN'
  },
  {
    value: 'max',
    label: 'MAX'
  },
  {
    value: 'avg',
    label: 'AVG'
  },
  {
    value: 'count',
    label: 'COUNT'
  },
  {
    value: 'distinct-count',
    label: 'DISTINCT COUNT'
  }
]

/**
 * Indicator template field list
 */
const INDICATOR_COLUMNS = [
  {
    name: 'name',
    label: 'Indicator Name'
  },
  {
    name: 'code',
    label: 'Indicator Code'
  },
  // {
  //   name: 'isActive',
  //   label: 'Is Active'
  // },
  {
    name: 'isApplication',
    label: 'Is App Applicable'
  },
  {
    name: 'visible',
    label: 'Is Visible'
  },
  {
    name: 'businessAreaId',
    label: 'Business Area'
  },
  {
    name: 'certificationId',
    label: 'Certification'
  },
  {
    name: 'business',
    label: 'Business'
  },
  {
    name: 'principal',
    label: 'Principal'
  },
  {
    name: 'validity',
    label: 'Validity'
  },
  {
    name: 'type',
    label: 'Type'
  },
  {
    name: 'modelId',
    label: 'Model'
  },
  {
    name: 'entity',
    label: 'Entity'
  },
  {
    name: 'options',
    label: 'Options'
  },
  // {
  //   name: 'calendar',
  //   label: 'Calendar'
  // },
  // {
  //   name: 'filters',
  //   label: 'Filters'
  // },
  // {
  //   name: 'dimensions',
  //   label: 'Free Dimensions'
  // },
  // {
  //   name: 'measure',
  //   label: 'Measure'
  // },
  // {
  //   name: 'formula',
  //   label: 'Formula'
  // },
  {
    name: 'unit',
    label: 'Unit'
  },
  {
    name: 'tags',
    label: 'Tags'
  }
]

export function injectFetchModelDetails() {
  const modelsService = inject(SemanticModelServerService)
  return (id: string) => {
    return modelsService
      .getById(id, {relations: ['dataSource', 'dataSource.type', 'indicators']})
      .pipe(map((model) => convertNewSemanticModelResult(model)))
  }
}

/**
 * Transform the indicator object to be exported based on the fixed field list.
 * 
 * @param indicator 
 * @returns 
 */
export function exportIndicator(indicator: IIndicator) {
  const fieldNames = INDICATOR_COLUMNS.map(({ name }) => name)
  return {
    ...pick<IIndicator>(indicator, fieldNames),
    // don't export system fields of tags
    tags: indicator.tags?.map((tag) => omitBlank(pick(tag, 'name', 'description', 'category', 'color')))
  }
}