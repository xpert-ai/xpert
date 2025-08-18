import { AggregationProperty } from "@metad/ocap-core"
import { AND, IsEmpty, Not, NOT, Parenthesis } from "./common"

/**
 * the absolute value of a numeric argument.
 *
 * @param Numeric_Expression
 * @returns
 */
export function Abs(Numeric_Expression: string) {
  return `Abs( ${Numeric_Expression} )`
}

/**
 * Returns the sum of a numeric expression evaluated over a specified set.
 *
 * If a numeric expression is specified, the specified numeric expression is evaluated across the set and then summed. If a numeric expression is not specified, the specified set is evaluated in the current context of the members of the set and then summed. If the SUM function is applied to a non-numeric expression, the results are undefined.
 *
 * @param Set_Expression
 * @param Numeric_Expression
 * @returns
 */
export function Sum(Set_Expression: string, Numeric_Expression?: string) {
  return `Sum( ${Set_Expression}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}

/**
 * Returns the minimum value of a numeric expression that is evaluated over a set.
 *
 * If a numeric expression is specified, the specified numeric expression is evaluated across the set and then returns the minimum value from that evaluation. If a numeric expression is not specified, the specified set is evaluated in the current context of the members of the set and then returns the minimum value from that evaluation.
 *
 * @param Set_Expression
 * @param Numeric_Expression
 */
export function Min(Set_Expression: string, Numeric_Expression?: string) {
  return `Min( ${Set_Expression}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}

/**
 * Returns the maximum value of a numeric expression that is evaluated over a set.
 *
 * If a numeric expression is specified, the specified numeric expression is evaluated across the set and then returns the maximum value from that evaluation. If a numeric expression is not specified, the specified set is evaluated in the current context of the members of the set and then returns the maximum value from that evaluation.
 *
 * @param Set_Expression
 * @param Numeric_Expression
 */
export function Max(Set_Expression: string, Numeric_Expression?: string) {
  return `Max( ${Set_Expression}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}

/**
 * Evaluates a set and returns the average of the non empty values of the cells in the set, averaged over the measures in the set or over a specified measure.
 *
 * @param Set_Expression
 * @param Numeric_Expression
 * @returns
 */
export function Avg(Set_Expression: string, Numeric_Expression?: string) {
  return `Avg( ${Set_Expression}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}

/**
 * Returns the sample standard deviation of a numeric expression evaluated over a set, using the unbiased population formula (dividing by n-1).
 *
 * The Stdev function uses the unbiased population formula, while the StdevP function uses the biased population formula.
 *
 * @param Set_Expression
 * @param Numeric_Expression
 * @returns
 */
export function Stdev(Set_Expression: string, Numeric_Expression?: string) {
  return `Stdev( ${Set_Expression}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}

export function StdevP(Set_Expression: string, Numeric_Expression?: string) {
  return `StdevP( ${Set_Expression}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}

/**
 * Returns the median value of a numeric expression that is evaluated over a set.
 *
 * If a numeric expression is specified, the specified numeric expression is evaluated across the set and then returns the median value from that evaluation. If a numeric expression is not specified, the specified set is evaluated in the current context of the members of the set and returns the median value from the evaluation.
 *
 * The median value is the middle value in a set of ordered numbers. (The medial value is unlike the mean value, which is the sum of a set of numbers divided by the count of numbers in the set). The median value is determined by choosing the smallest value such that at least half of the values in the set are no greater than the chosen value. If the number of values within the set is odd, the median value corresponds to a single value. If the number of values within the set is even, the median value corresponds to the sum of the two middle values divided by two.
 *
 * @param Set_Expression
 * @param Numeric_Expression
 * @returns
 */
export function Median(Set_Expression: string, Numeric_Expression?: string) {
  return `Median( ${Set_Expression}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}

/**
 * Sorts a set in descending order and returns the specified number of elements with the highest values.
 *
 * @param Set_Expression
 * @param count
 * @param Numeric_Expression
 * @returns
 */
export function TopCount(Set_Expression: string, count: number | string, Numeric_Expression?: string) {
  return `TopCount( ${Set_Expression}, ${count}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}
/**
 * Sorts a set in descending order, and returns a set of tuples with the highest values whose cumulative total is equal to or greater than a specified percentage.
 *
 * The TopPercent function calculates the sum of the specified numeric expression evaluated over the specified set, sorting the set in descending order. The function then returns the elements with the highest values whose cumulative percentage of the total summed value is at least the specified percentage. This function returns the smallest subset of a set whose cumulative total is at least the specified percentage. The returned elements are ordered largest to smallest.
 *
 * @param Set_Expression
 * @param percentage
 * @param Numeric_Expression
 * @returns
 */
export function TopPercent(Set_Expression: string, percentage: number | string, Numeric_Expression: string) {
  return `TopPercent( ${Set_Expression}, ${percentage}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}
export function TopSum(Set_Expression: string, value: number | string, Numeric_Expression: string) {
  return `TopSum( ${Set_Expression}, ${value}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}

/**
 * Sorts a set in ascending order, and returns the specified number of tuples in the specified set with the lowest values.
 *
 * @param Set_Expression
 * @param count
 * @param Numeric_Expression
 * @returns
 */
export function BottomCount(Set_Expression: string, count: number, Numeric_Expression?: string) {
  return `BottomCount( ${Set_Expression}, ${count}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}
export function BottomPercent(Set_Expression: string, percentage: number, Numeric_Expression?: string) {
  return `BottomPercent( ${Set_Expression}, ${percentage}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}
export function BottomSum(Set_Expression: string, value: number, Numeric_Expression: string) {
  return `BottomSum( ${Set_Expression}, ${value}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}

export function Subtract(Numeric_Expression1, Numeric_Expression2) {
  return `${Numeric_Expression1} - ${Numeric_Expression2}`
}

export function Divide(dividend: string, divisor: string) {
  return `${dividend} / ${divisor}`
}

export function GreaterThan(left: string, right: string) {
  return `${left} > ${right}`
}

export function GreaterEqual(left: string, right: string) {
  return `${left} >= ${right}`
}

export function LessThan(left: string, right: string) {
  return `${left} < ${right}`
}

export function LessEqual(left: string, right: string) {
  return `${left} <= ${right}`
}

export function Between(left: string, right: string[]) {
  return AND(GreaterEqual(left, right[0]), LessEqual(left, right[1]))
}

export function NotBetween(left: string, right: string[]) {
  return NOT(Parenthesis(AND(GreaterEqual(left, right[0]), LessEqual(left, right[1]))))
}

export function Equal(left: string, right: string) {
  return `${left} = ${right}`
}

export function NotEqual(left: string, right: string) {
  return `${left} <> ${right}`
}

export function LogicalExpression(expression: string, operator: AggregationProperty['compare'], value?: string | number) {
  switch(operator) {
    case 'empty':
      return IsEmpty(expression)
    case 'not_empty':
      return Not(IsEmpty(expression))
    default:
      return `${expression} ${operator} ${value !== undefined ? value : ''}`
  }
}