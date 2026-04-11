import { MemberType, PivotColumn } from "@xpert-ai/ocap-core";

/**
 * https://docs.microsoft.com/en-us/analysis-services/multidimensional-models/mdx/mdx-member-properties-intrinsic-member-properties?view=asallproducts-allversions
 */
export interface MemberIntrinsic {
    MEMBER_TYPE: MemberType
    PARENT_UNIQUE_NAME: string
    MEMBER_CAPTION: string
    DESCRIPTION: string
}

export interface Member extends MemberIntrinsic {
    Caption: string
    DisplayInfo: string
    LName: string
    LNum: number
    UName: string
    hierarchy: string
    index: number
}

interface Tuple {
    index: number
    hierarchies: {
        [name: string]: Member
    },
    members: Member[]
}

export interface Axis {
    numTuples: null
    numHierarchies: null

    close()

    reset()
    hasMoreHierarchies()
    nextHierarchy()
    eachHierarchy(callback, scope?, args?)
    hasMoreTuples()
    nextTuple()
    tupleCount()
    tupleIndex()
    getTuple(): Tuple
    eachTuple(callback: (tuple: Tuple) => boolean, scope?, args?)
    getHierarchies(): Array<HierarchyInfo>
    getHierarchyNames()
    hierarchyCount()
    hierarchyIndex(hierarchyName)
    hierarchyName(index)
    hierarchy(hierarchyIndexOrName): HierarchyInfo
    member(hierarchyIndexOrName: any)
    hasMemberProperty(propertyName)
    readAsArray(array?)
    readAsObject(object?)
    fetchAsArray(array?)
    fetchAsObject(object?)
    fetchAllAsArray(rows?)
    fetchAllAsObject(rows?)
}

export interface Cell {
    Value: number
    FmtValue: string
    FormatString: string
    Currency: string
    Unit: string
}

export interface Cellset {
    cellValue()
    cellProperty(property: string)
    nextCell(): -1 | number
    cellOrdinal(): number
    getByOrdinal(ordinal: number, tObj?: Record<string, unknown>): Cell
    indexForOrdinal(ordinal: number): number
    close()
}

export interface Dataset {
    axisCount(): number
    getAxis(nameOrIndex): Axis
    hasAxis(nameOrIndex): boolean
    getColumnAxis(): Axis
    hasColumnAxis(): boolean
    getRowAxis(): Axis
    hasRowAxis(): boolean
    getCellset(): Cellset
    fetchAsObject(): any
}

interface HierarchyPropertyInfo {
    name: string
}

export interface HierarchyInfo {
    index: number
    name: string
    UName: HierarchyPropertyInfo
    Caption: HierarchyPropertyInfo
    LName: HierarchyPropertyInfo
    LNum: HierarchyPropertyInfo
    DisplayInfo: HierarchyPropertyInfo
}


export interface _PivotColumn extends PivotColumn {
    name: string;
    label?: string;
    dataType?: string;
    columns?: Array<PivotColumn>;
    isSummary?: boolean;
    // member?: string;
    memberType?: MemberType;
    uniqueName?: string;
    parentUniqueName?: string;
    childrenCardinality?: number
    properties?: Array<PivotColumn>;
    isCell?: boolean
}