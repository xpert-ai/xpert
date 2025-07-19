import { uniq } from 'lodash'

/**
 * Returns a number that is calculated by aggregating over the cells returned by the set expression.
 * If a numeric expression is not provided, this function aggregates each measure within the current query context by
 * using the default aggregation operator that is specified for each measure. If a numeric expression is provided,
 * this function first evaluates, and then sums, the numeric expression for each cell in the specified set.
 * 
 * @param Set_Expression 
 * @param Numeric_Expression 
 * @returns 
 */
export function Aggregate(Set_Expression: string, Numeric_Expression?: string) {
    return `Aggregate( ${Set_Expression}${Numeric_Expression ? `, ${Numeric_Expression}` : ''} )`
}

/**
 * A function that returns the ancestor of a specified member at a specified level or at a specified distance from the member.
 * 
 * @param Member_Expression 
 * @param level Level_Expression | Distance
 * @returns 
 */
export function Ancestor(Member_Expression: string, level: string | number) {
    return `Ancestor( ${Member_Expression}, ${level} )`
}

export function Ancestors(Member_Expression: string, level: string | number) {
    return `Ancestors( ${Member_Expression}, ${level} )`
}

/**
 * Returns the set of the ascendants of a specified member, including the member itself.
 * 
 * @param Member_Expression A valid Multidimensional Expressions (MDX) expression that returns a member.
 * @returns 
 */
export function Ascendants(Member_Expression: string) {
    return `Ascendants( ${Member_Expression} )`
}

/**
 * Returns the cross product of one or more sets.
 * 
 * The Crossjoin function returns the cross product of two or more specified sets. The order of tuples in the resulting
 * set depends on the order of the sets to be joined and the order of their members.
 * For example, when the first set consists of `{x1, x2,...,xn}`, and the second set consists of `{y1, y2, ..., yn}`,
 * the cross product of these sets is:
 * 
 * ```
 * {(x1, y1), (x1, y2),...,(x1, yn), (x2, y1), (x2, y2),...,
 * (x2, yn),..., (xn, y1), (xn, y2),..., (xn, yn)}
 * ```
 *
 * @param Set_Expression 
 * @returns 
 */
export function Crossjoin(...Set_Expression: string[]) {
    return Set_Expression.length > 1 ? `Crossjoin( ${Set_Expression.join(', ')} )` : Set_Expression.join(', ')
}

/**
 * Alternative for `Crossjoin`
 * 
 * @param Set_Expression 
 * @returns `Set_Expression * Set_Expression`
 */
export function CrossjoinOperator(...Set_Expression: string[]) {
    return Set_Expression.join(' * ')
}

/**
 * Converts an empty cell value to a specified nonempty cell value, which can be either a number or string.
 * 
 * @param expressions 
 * @returns 
 */
export function CoalesceEmpty(...expressions: string[]) {
    return `CoalesceEmpty( ${expressions.join(', ')} )`
}

/**
 * This function operates on the order and position of members within levels. If two hierarchies exist, in which the first one has four levels and the second one has five levels, the cousin of the third level of the first hierarchy is the third level of the second hierarchy.
 * 
 * @param Member_Expression 
 * @param Ancestor_Member_Expression 
 * @returns the child member with the same relative position under a parent member as the specified child member.
 */
export function Cousin(Member_Expression: string, Ancestor_Member_Expression: string) {
    return `Cousin( ${Member_Expression}, ${Ancestor_Member_Expression} )`
}

export function CurrentMember(MemberOrSet_Expression: string) {
    return `${MemberOrSet_Expression}.CurrentMember`
}
export function PrevMember(Member_Expression: string) {
    return `${Member_Expression}.PrevMember`
}
export function Children(Set_Expression: string) {
    return `${Set_Expression}.Children`
}
export function CurrentMemberCaption(MemberOrSet_Expression: string) {
    return `${MemberOrSet_Expression}.CurrentMember.Caption`
}
export function CurrentMemberName(MemberOrSet_Expression: string) {
    return `${MemberOrSet_Expression}.CurrentMember.Name`
}
export function CurrentMemberUniqueName(MemberOrSet_Expression: string) {
    return `${MemberOrSet_Expression}.CurrentMember.UniqueName`
}

/**
 * Returns the number of cells in a set.
 * 
 * The `Count (Set)` function includes or excludes empty cells, depending on the syntax used.
 * If the standard syntax is used, empty cells can be excluded or included by using the `EXCLUDEEMPTY` or `INCLUDEEMPTY` flags, respectively.
 * If the alternate syntax is used, the function always includes empty cells.
 * To exclude empty cells in the count of a set, use the standard syntax and the optional `EXCLUDEEMPTY` flag.
 * 
 * @param Set_Expression 
 * @param excludeEmpty 
 */
export function Count(Set_Expression: string, excludeEmpty?: boolean) {
    return `Count( ${Set_Expression}${excludeEmpty ? ', EXCLUDEEMPTY' : ''} )`
}

/**
 * Evaluates a specified set, removes duplicate tuples from the set, and returns the resulting set.
 * 
 * @param Set_Expression A valid Multidimensional Expressions (MDX) expression that returns a set.
 * @returns 
 */
export function Distinct(Set_Expression: string) {
    return `Distinct( ${Set_Expression} )`
}

/**
 * ref to [DistinctCount](https://docs.microsoft.com/en-us/sql/mdx/distinctcount-mdx?view=sql-server-ver15)
 * 
 * @param setExpression 
 * @returns 
 */
export function DistinctCount(setExpression: string) {
    return `DistinctCount( {${setExpression}} )`
}

/**
 * Evaluates two sets and removes those tuples in the first set that also exist in the second set, optionally retaining duplicates.
 * 
 * If **ALL** is specified, the function retains duplicates found in the first set; duplicates found in the second set will still be removed. The members are returned in the order they appear in the first set.
 * 
 * @param Set_Expression1 
 * @param Set_Expression2 
 * @param all 
 * @returns 
 */
export function Except(Set_Expression1: string, Set_Expression2: string, all?: boolean ) {
    return `Except( ${Set_Expression1}, ${Set_Expression2}${all ? `, All` : ''} )`
}

/**
 * Returns the set that results from filtering a specified set based on a search condition.
 * 
 * ref to [Filter](https://docs.microsoft.com/en-us/sql/mdx/filter-mdx?view=sql-server-ver15)
 * 
 * @param Set_Expression A valid Multidimensional Expressions (MDX) expression that returns a set.
 * @param Logical_Expression A valid Multidimensional Expressions (MDX) logical expression that evaluates to true or false.
 */
export function Filter(Set_Expression, Logical_Expression) {
    return `Filter( ${Set_Expression}, ${Logical_Expression} )`
}

/**
 * Evaluates different branch expressions depending on whether a Boolean condition is true or false.
 * 
 * @param Logical_Expression A condition that evaluates to true (1) or false (0). It must be a valid Multidimensional Expressions (MDX) logical expression.
 * @param Expression1 Used when the logical expression evaluates to true. Expression1 must be a valid Multidimensional Expressions (MDX) expression.
 * @param Expression2 Used when the logical expression evaluates to false. Expression2 must be valid Multidimensional Expressions (MDX) expression.
 * @returns 
 */
export function IIf(Logical_Expression: string, Expression1: string, Expression2: string) {
    return `IIf( ${Logical_Expression}, ${Expression1}, ${Expression2} )`
}

/**
 * Returns whether the evaluated expression is the empty cell value.
 * 
 * @param Value_Expression A valid Multidimensional Expressions (MDX) expression that typically returns the cell coordinates of a member or a tuple.
 */
export function IsEmpty(Value_Expression: string) {
    return `IsEmpty( ${Value_Expression} )`
}

/**
 * Returns the position of the first occurrence of one string within another.
 * 
 * `InStr([start, ]searched_string, search_string[, compare])`
 * 
 * * Instr always performs a case-insensitive comparison.
 * 
 * @param Value_Expression 
 * @returns 
 */
export function InStr(...Value_Expression: string[]) {
    return `InStr(${Value_Expression.join(', ')})`
}

/**
 * Member positions within a level are determined by the attribute hierarchy's natural order. The numbering of the positions is zero-based.
 *
 * * If the specified lag is zero, the Lag function returns the specified member itself.
 * * If the specified lag is negative, the Lag function returns a subsequent member.
 * * `Lag(1)` is equivalent to the `PrevMember` function. `Lag(-1)` is equivalent to the `NextMember` function.
 * 
 * The Lag function is similar to the {@link Lead} function, except that the {@link Lead} function looks in the opposite direction to the `Lag` function. That is, `Lag(n)` is equivalent to `Lead(-n)`.

 * @param Member_Expression 
 * @param Index 
 * @returns the member that is a specified number of positions before a specified member at the member's level.
 */
export function Lag(Member_Expression: string, Index = 0) {
    return `${Member_Expression}.Lag(${Index || 0})`
}

/**
 * Member positions within a level are determined by the attribute hierarchy's natural order. The numbering of the positions is zero-based.
 * 
 * * If the specified lead is zero (0), the Lead function returns the specified member.
 * * If the specified lead is negative, the Lead function returns a prior member.
 * * Lead(1) is equivalent to the {@link NextMember} function. Lead(-1) is equivalent to the {@link PrevMember} function.
 *
 * The Lead function is similar to the {@link Lag} function, except that the {@link Lag} function looks in the opposite direction to the `Lead` function. That is, `Lead(n)` is equivalent to `Lag(-n)`.
 * @param Member_Expression 
 * @param Index 
 * @returns the member that is a specified number of positions following a specified member along the member's level.
 */
export function Lead(Member_Expression: string, Index = 0) {
    return `${Member_Expression}.Lead(${Index || 0})`
}

/**
 * Performs a logical negation on a numeric expression.
 * 
 * @param Expression 
 */
export function Not(Expression: string) {
    return `NOT ${Expression}`
}

/**
 * Returns a set that contains the cross product of one or more sets, excluding empty tuples and tuples without associated fact table data.
 * 
 * `NonEmptyCrossjoin(Set_Expression1 [ ,Set_Expression2,...] [,Count ] )`
 * 
 * @deprecated use `Exists` or `NonEmpty`
 * @param Expression 
 * @returns 
 */
export function NonEmptyCrossjoin(...Set_Expression: string[]) {
    return `NonEmptyCrossjoin( ${Set_Expression.join(', ')} )`
}


/**
 * Returns the set of descendants of a member at a specified level or distance, optionally including or excluding descendants in other levels.
 * 
 * ref to [Descendants](https://docs.microsoft.com/en-us/sql/mdx/descendants-mdx?view=sql-server-ver15)
 * 
 * @param MemberOrSet_Expression 
 * @param LevelOrDistance 
 * @param Desc_Flag 
 * @returns 
 */
export function Descendants(MemberOrSet_Expression: string, LevelOrDistance?: string | number, Desc_Flag?: DescendantsFlag) {
    return `Descendants( ${MemberOrSet_Expression}${LevelOrDistance ? `, ${LevelOrDistance}` : ''}${Desc_Flag ? `, ${Desc_Flag}` : ''} )`
}

export enum DescendantsFlag {
    /**
     * Returns only descendant members from the specified level or at the specified distance.
     * The function includes the specified member, if the specified level is the level of the specified member.
     */
    SELF = 'SELF',
    /**
     * Returns descendant members from all levels subordinate to the specified level or distance.
     */
    AFTER = 'AFTER',

    /**
     * Returns descendant members from all levels between the specified member and the specified level, or at the specified distance.
     * It includes the specified member, but does not include members from the specified level or distance.
     */
    BEFORE = 'BEFORE',

    /**
     * Returns descendant members from all levels subordinate to the level of the specified member.
     * It includes the specified member, but does not include members from the specified level or at the specified distance.
     */
    BEFORE_AND_AFTER = 'BEFORE_AND_AFTER',

    /**
     * Returns descendant members from the specified level or at the specified distance and all levels subordinate to the specified level, or at the specified distance.
     */
    SELF_AND_AFTER = 'SELF_AND_AFTER',

    /**
     * Returns descendant members from the specified level or at the specified distance, and from all levels between the specified member and the specified level, or at the specified distance, including the specified member.
     */
    SELF_AND_BEFORE = 'SELF_AND_BEFORE',

    /**
     * Returns descendant members from all levels subordinate to the level of the specified member, and includes the specified member.
     */
    SELF_BEFORE_AFTER = 'SELF_BEFORE_AFTER',

    /**
     * Returns leaf descendant members between the specified member and the specified level, or at the specified distance.
     */
    LEAVES = 'LEAVES'
}

/**
 * [MDX Member Properties - Intrinsic Member Properties](https://docs.microsoft.com/en-us/analysis-services/multidimensional-models/mdx/mdx-member-properties-intrinsic-member-properties?view=asallproducts-allversions)
 * 
 * @param properties 
 * @returns 
 */
export function DimensionProperties(properties: string[]) {
    return `DIMENSION PROPERTIES ${uniq(properties).join(', ')}`
}

/**
 * Properties function
 * 
 * @param expression dimension member expression
 * @param property name of property
 * @returns dimension member's property expression
 */
export function Properties(expression: string, property: string) {
    return `${expression}.Properties("${property}")`
}

export function CurrentMemberProperties(MemberOrSetExpression: string, property: string) {
    return Properties(CurrentMember(MemberOrSetExpression), property)
}

/**
 * Applies a set to each member of another set, and then joins the resulting sets by union.
 * Alternatively, this function returns a concatenated string created by evaluating a string expression over a set.
 * 
 * @param Set_Expression1 
 * @param SetOrString_Expression 
 * @param flag 
 * @returns 
 */
export function Generate(Set_Expression1, SetOrString_Expression, flag?: 'ALL' | 'Delimiter') {
    return `Generate( ${Set_Expression1}, ${SetOrString_Expression}${flag ? `, ${flag}` : ''} )`
}

export function Ordinal(Level_Expression: string) {
    return `${Level_Expression}.Ordinal`
}

/**
 * Arranges members of a specified set, optionally preserving or breaking the hierarchy.
 * 
 * @param Set_Expression 
 * @param NumericOrString_Expression 
 * @param flag 
 * @returns 
 */
export function Order(Set_Expression: string, NumericOrString_Expression: string, flag?: OrderFlag) {
    return `Order( ${Set_Expression}, ${NumericOrString_Expression}${flag ? `, ${flag}` : ''} )`
}

export enum OrderFlag {
    ASC = 'ASC',
    DESC = 'DESC',
    BASC = 'BASC',
    BDESC = 'BDESC'
}

/**
 * Although similar to the {@link Cousin} function, the ParallelPeriod function is more closely related to time series. The ParallelPeriod function takes the ancestor of the specified member at the specified level, finds the ancestor's sibling with the specified lag, and finally returns the parallel period of the specified member among the descendants of the sibling.
 * 
 * The ParallelPeriod function has the following defaults:
 * * If neither a level expression nor a member expression is specified, the default member value is the current member of the first hierarchy on the first dimension with a type of **Time** in the measure group.
 * * If a level expression is specified, but a member expression is not specified, the default member value is *Level_Expression***.Hierarchy.CurrentMember**.
 * * The default index value is 1.
 * * The default level is the level of the parent of the specified member.
 * 
 * The **ParallelPeriod** function is equivalent to the following MDX statement:
 * 
 * `Cousin(Member_Expression, Ancestor(Member_Expression, Level_Expression) .Lag(Numeric_Expression))`
 * 
 * @param calendarLevel 
 * @param index 
 * @param member 
 * @returns a member from a prior period in the same relative position as a specified member.
 */
export function ParallelPeriod(calendarLevel: string, index: number, member: string) {
    return `ParallelPeriod( ${calendarLevel}, ${index}, ${member} )`
}

export function Periodstodate(measure: string, calendarLevel: string, member: string) {
    return `Periodstodate( ${calendarLevel}, ${member} ), (${measure} )`
}

export function Tuple(...Member_expressions: Array<string>) {
    return `(${Member_expressions.join(', ')})`
}

export function MemberSet(...Member_expressions: Array<string>) {
    return Member_expressions.length > 1 ? `{${Member_expressions.join(', ')}}` : Member_expressions.join(', ')
}

export function Members(Expression: string) {
    return `${Expression}.Members`
}

export function Parenthesis(expression: string) {
    return `( ${expression} )`
}

export function AND(...expressions: string[]) {
    return expressions.join(' AND ')
}

export function OR(...expressions: string[]) {
    return expressions.join(' OR ')
}

export function NOT(expression: string) {
    return `NOT ${expression}`
}

export function IS(expression1: string, expression2?: string) {
    return `${expression1} IS ${expression2 ? expression2 : 'NULL'}`
}

export function Left(expression: string, length: number) {
    return `Left(${expression}, ${length})`
}
export function Right(expression: string, length: number) {
    return `Right(${expression}, ${length})`
}
