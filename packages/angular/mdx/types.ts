import { AggregationRole } from "@xpert-ai/ocap-core"

// dimension or hierarchy field name regex
export const C_MDX_FIELD_NAME_REGEX = `[a-zA-Z0-9\u4E00-\u9FCC\\/\\s_\\-]*`

/**
 * NodeType 即 PropertyType 代表字段节点的类型, 联合上 Readonly 属性可以表示一个字段是来源于 CUbe 配置还是来源目标系统 API.
 * 来源于本系统的 XMLA Model 的 Cube 配置可以被修改, 而来源于目标系统 API 的字段是只读 Readonly, 只能配置一些增强属性.
 */
export enum MDXNodeType {
    Property = 'property',
    Dimension = 'dimension',
    Hierarchy = 'hierarchy',
    Level = 'level',
    Measure = 'measure',
    CalculatedMember = 'calculatedMember',
    NamedSet = 'namedSet'
}

/**
 * Node for Property item
 */
 export class PropertyItemNode {
    children?: PropertyItemNode[]
    id: string
    name: string
    label: string
    role: AggregationRole
    readonly?: boolean
    isUsage: boolean
}

/** Flat Property item node with expandable and level information */
export class PropertyItemFlatNode {
    id: string
    name: string
    label: string
    level: number
    expandable: boolean
    role: AggregationRole
    readonly: boolean
    isUsage: boolean
}