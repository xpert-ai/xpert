export enum MemberType {
  MDMEMBER_TYPE_REGULAR = 1,
  MDMEMBER_TYPE_ALL     = 2,
  MDMEMBER_TYPE_FORMULA = 3, 
  MDMEMBER_TYPE_MEASURE = 4,
  MDMEMBER_TYPE_UNKNOWN = 5
}

export interface IDimensionMember {
  modelId?: string
  entity?: string
  dimension: string
  hierarchy?: string
  level?: string
  levelNumber?: number
  memberOrdinal?: number
  memberKey: string
  memberUniqueName?: string
  memberType?: MemberType
  memberGuid?: string
  memberCaption?: string
  visible?: boolean
  childrenCardinality?: number
  parentLevel?: number
  parentKey?: string
  parentCount?: number
  treeOp?: string
  depth?: number
}

export const DimensionMemberRecursiveHierarchy = {
  parentNodeProperty: 'parentKey',
  externalKeyProperty: 'memberUniqueName',
  valueProperty: 'memberKey',
  labelProperty: 'memberCaption',
  levelProperty: 'levelNumber',
  descendantCountProperty: 'childrenCardinality',
  memberTypeProperty: 'memberType'
}

export enum IntrinsicMemberProperties {
  Unkown = 'Unkown',
  CATALOG_NAME = 'CATALOG_NAME',
  DESCRIPTION = 'DESCRIPTION',
  PARENT_UNIQUE_NAME = 'PARENT_UNIQUE_NAME',
  MEMBER_UNIQUE_NAME = 'MEMBER_UNIQUE_NAME',
  MEMBER_CAPTION = 'MEMBER_CAPTION',
  MEMBER_TYPE = 'MEMBER_TYPE',
  LEVEL_NUMBER = 'LEVEL_NUMBER',
  CHILDREN_CARDINALITY = 'CHILDREN_CARDINALITY',
}

/**
 * Fields used in dimension member tooltip
 */
export const DIMENSION_MEMBER_FIELDS: {key: string; label: string; formatter?: (v) => string}[] = [
  { key: 'memberKey', label: 'Member Key' },
  { key: 'memberCaption', label: 'Member Caption' },
  { key: 'memberUniqueName', label: 'Member Unique Name' },
  { key: 'dimension', label: 'Dimension' },
  { key: 'level', label: 'Level' },
  { key: 'levelNumber', label: 'Level Number' },
  { key: 'visible', label: 'Visible', formatter: v => (v ? 'Yes' : 'No') },
  { key: 'parentKey', label: 'Parent Key' },
  { key: 'childrenCardinality', label: 'Children Cardinality' },
];
