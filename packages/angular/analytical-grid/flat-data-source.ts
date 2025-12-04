import { _isNumberValue } from '@angular/cdk/coercion'
import { MatTableDataSource } from '@angular/material/table'
import { extractHierarchyFromUniqueName } from '@metad/ocap-core'

/**
 * Corresponds to `Number.MAX_SAFE_INTEGER`. Moved out into a variable here due to
 * flaky browser support and the value not being defined in Closure's typings.
 */
const MAX_SAFE_INTEGER = 9007199254740991

export class NgmFlatTableDataSource<T> extends MatTableDataSource<T> {
  override sortingDataAccessor: (data: T, sortHeaderId: string) => string | number = (
    data: T,
    sortHeaderId: string
  ): string | number => {
    const hierarchy = extractHierarchyFromUniqueName(sortHeaderId)
    const cell = (data as { [key: string]: any })[hierarchy]
    const value = typeof cell === 'string' ? cell : cell?.value

    if (_isNumberValue(value)) {
      const numberValue = Number(value)

      // Numbers beyond `MAX_SAFE_INTEGER` can't be compared reliably so we
      // leave them as strings. For more info: https://goo.gl/y5vbSg
      return numberValue < MAX_SAFE_INTEGER ? numberValue : value
    }

    return value
  }

//   override sortData: (data: T[], sort: MatSort) => T[] = (data: T[], sort: MatSort): T[] => {
//     const active = sort.active
//     const direction = sort.direction
//     if (!active || direction == '') {
//       return data
//     }

//     return data.sort((a, b) => {
//       let valueA = this.sortingDataAccessor(a, active)
//       let valueB = this.sortingDataAccessor(b, active)

//       // If there are data in the column that can be converted to a number,
//       // it must be ensured that the rest of the data
//       // is of the same type so as not to order incorrectly.
//       const valueAType = typeof valueA
//       const valueBType = typeof valueB

//       if (valueAType !== valueBType) {
//         if (valueAType === 'number') {
//           valueA += ''
//         }
//         if (valueBType === 'number') {
//           valueB += ''
//         }
//       }

//       // If both valueA and valueB exist (truthy), then compare the two. Otherwise, check if
//       // one value exists while the other doesn't. In this case, existing value should come last.
//       // This avoids inconsistent results when comparing values to undefined/null.
//       // If neither value exists, return 0 (equal).
//       let comparatorResult = 0
//       if (valueA != null && valueB != null) {
//         // Check if one value is greater than the other; if equal, comparatorResult should remain 0.
//         if (valueA > valueB) {
//           comparatorResult = 1
//         } else if (valueA < valueB) {
//           comparatorResult = -1
//         }
//       } else if (valueA != null) {
//         comparatorResult = 1
//       } else if (valueB != null) {
//         comparatorResult = -1
//       }

//       return comparatorResult * (direction == 'asc' ? 1 : -1)
//     })
//   }
}
