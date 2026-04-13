import { ValueListAnnotation, PropertyName, RecursiveHierarchyType } from "@xpert-ai/ocap-core";

// 是否需要移到 ds-core 和其他类型放在一起?
export interface Hierarchy {
    parentChild?: RecursiveHierarchyType,
    leveled?: Array<string>
}

/**
 * @deprecated 使用 { RecursiveHierarchyType}
 */
export interface ParentChild {
    // 父节点字段
    parent: string
    // 子节点字段
    child: string
    siblingsOrder?: SiblingsOrder
    direction?: string
    // 所在层级字段
    level?: string
    drillState?: string
    // 后代节点个数字段
    descendantCount?: string
}

export interface SiblingsOrder {
    by: string
    direction: 'ASC' | 'DESC'
}

export interface PropertyRecursiveHierarchy {
    propertyName: PropertyName,
    propertyLabel: string,
    recursiveHierarchy: RecursiveHierarchyType
}

export interface PropertyValueHelp {
    valueListAnnotation: ValueListAnnotation,
    recursiveHierarchies: Array<PropertyRecursiveHierarchy>
}
