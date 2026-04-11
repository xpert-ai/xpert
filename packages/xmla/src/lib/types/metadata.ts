import { IDimensionMember, Property, PropertyHierarchy, PropertyLevel } from '@xpert-ai/ocap-core'
import { lowerCase, lowerFirst, upperFirst } from 'lodash'
import { DIMENSION_TYPE, XmlaMember } from './rowset'

/**
 * MDX Cube Type
 */
export interface MDXCube {
  catalogName?: string
  schemaName?: string
  cubeName: string
}

/**
 * 增加 XMLA 相关的 Dimension 属性，继承自 @xpert-ai/ocap-core 中的 {@link Property}
 * 
 * ```xml
 * <xsd:complexType name="row">
 *      <xsd:sequence>
 *          <xsd:element sql:field="CATALOG_NAME" name="CATALOG_NAME" type="xsd:string" minOccurs="0"/>
 *          <xsd:element sql:field="SCHEMA_NAME" name="SCHEMA_NAME" type="xsd:string" minOccurs="0"/>
 *          <xsd:element sql:field="CUBE_NAME" name="CUBE_NAME" type="xsd:string"/>
 *          <xsd:element sql:field="DIMENSION_NAME" name="DIMENSION_NAME" type="xsd:string"/>
 *          <xsd:element sql:field="DIMENSION_UNIQUE_NAME" name="DIMENSION_UNIQUE_NAME" type="xsd:string"/>
 *          <xsd:element sql:field="DIMENSION_GUID" name="DIMENSION_GUID" type="uuid" minOccurs="0"/>
 *          <xsd:element sql:field="DIMENSION_CAPTION" name="DIMENSION_CAPTION" type="xsd:string"/>
 *          <xsd:element sql:field="DIMENSION_ORDINAL" name="DIMENSION_ORDINAL" type="xsd:unsignedInt"/>
 *          <xsd:element sql:field="DIMENSION_TYPE" name="DIMENSION_TYPE" type="xsd:short"/>
 *          <xsd:element sql:field="DIMENSION_CARDINALITY" name="DIMENSION_CARDINALITY" type="xsd:unsignedInt"/>
 *          <xsd:element sql:field="DEFAULT_HIERARCHY" name="DEFAULT_HIERARCHY" type="xsd:string"/>
 *          <xsd:element sql:field="DESCRIPTION" name="DESCRIPTION" type="xsd:string" minOccurs="0"/>
 *          <xsd:element sql:field="IS_VIRTUAL" name="IS_VIRTUAL" type="xsd:boolean" minOccurs="0"/>
 *          <xsd:element sql:field="IS_READWRITE" name="IS_READWRITE" type="xsd:boolean" minOccurs="0"/>
 *          <xsd:element sql:field="DIMENSION_UNIQUE_SETTINGS" name="DIMENSION_UNIQUE_SETTINGS" type="xsd:int" minOccurs="0"/>
 *          <xsd:element sql:field="DIMENSION_MASTER_UNIQUE_NAME" name="DIMENSION_MASTER_UNIQUE_NAME" type="xsd:string" minOccurs="0"/>
 *          <xsd:element sql:field="DIMENSION_IS_VISIBLE" name="DIMENSION_IS_VISIBLE" type="xsd:boolean" minOccurs="0"/>
 *          <xsd:element sql:field="HIERARCHIES" name="HIERARCHIES" minOccurs="0"/>
 *      </xsd:sequence>
 * </xsd:complexType>
 * ```
 * 
 * Sample:
 * ```xml
 * <row>
    <CATALOG_NAME>FoodMart</CATALOG_NAME>
    <SCHEMA_NAME>FoodMart</SCHEMA_NAME>
    <CUBE_NAME>HR</CUBE_NAME>
    <DIMENSION_NAME>Department</DIMENSION_NAME>
    <DIMENSION_UNIQUE_NAME>[Department]</DIMENSION_UNIQUE_NAME>
    <DIMENSION_CAPTION>Department</DIMENSION_CAPTION>
    <DIMENSION_ORDINAL>6</DIMENSION_ORDINAL>
    <DIMENSION_TYPE>3</DIMENSION_TYPE>
    <DIMENSION_CARDINALITY>13</DIMENSION_CARDINALITY>
    <DEFAULT_HIERARCHY>[Department]</DEFAULT_HIERARCHY>
    <DESCRIPTION>HR Cube - Department Dimension</DESCRIPTION>
    <IS_VIRTUAL>false</IS_VIRTUAL>
    <IS_READWRITE>false</IS_READWRITE>
    <DIMENSION_UNIQUE_SETTINGS>0</DIMENSION_UNIQUE_SETTINGS>
    <DIMENSION_IS_VISIBLE>true</DIMENSION_IS_VISIBLE>
 * </row>
 * ```
 */
export interface MDXDimension extends Property, MDXCube {
  dimensionName: string
  dimensionUniqueName: string
  dimensionGuid?: string
  dimensionCaption: string
  dimensionOrdinal: number
  dimensionType: DIMENSION_TYPE
  dimensionCardinality: number
  defaultHierarchy: string
  description?: string
  isVirtual?: boolean
  isReadwrite?: boolean
  dimensionUniqueSettings?: number
  // for SAP MDX ?
  dimensionMasterUniqueName?: string
  // for SAP MDX ?
  dimensionIsVisible?: boolean
  hierarchies?: Array<MDXHierarchy>
}

/**
 * 
 * ```xml
 * <xsd:complexType name="row">
    <xsd:sequence>
        <xsd:element sql:field="CATALOG_NAME" name="CATALOG_NAME" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="SCHEMA_NAME" name="SCHEMA_NAME" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="CUBE_NAME" name="CUBE_NAME" type="xsd:string"/>
        <xsd:element sql:field="DIMENSION_UNIQUE_NAME" name="DIMENSION_UNIQUE_NAME" type="xsd:string"/>
        <xsd:element sql:field="HIERARCHY_NAME" name="HIERARCHY_NAME" type="xsd:string"/>
        <xsd:element sql:field="HIERARCHY_UNIQUE_NAME" name="HIERARCHY_UNIQUE_NAME" type="xsd:string"/>
        <xsd:element sql:field="HIERARCHY_GUID" name="HIERARCHY_GUID" type="uuid" minOccurs="0"/>
        <xsd:element sql:field="HIERARCHY_CAPTION" name="HIERARCHY_CAPTION" type="xsd:string"/>
        <xsd:element sql:field="DIMENSION_TYPE" name="DIMENSION_TYPE" type="xsd:short"/>
        <xsd:element sql:field="HIERARCHY_CARDINALITY" name="HIERARCHY_CARDINALITY" type="xsd:unsignedInt"/>
        <xsd:element sql:field="DEFAULT_MEMBER" name="DEFAULT_MEMBER" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="ALL_MEMBER" name="ALL_MEMBER" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="DESCRIPTION" name="DESCRIPTION" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="STRUCTURE" name="STRUCTURE" type="xsd:short"/>
        <xsd:element sql:field="IS_VIRTUAL" name="IS_VIRTUAL" type="xsd:boolean"/>
        <xsd:element sql:field="IS_READWRITE" name="IS_READWRITE" type="xsd:boolean"/>
        <xsd:element sql:field="DIMENSION_UNIQUE_SETTINGS" name="DIMENSION_UNIQUE_SETTINGS" type="xsd:int"/>
        <xsd:element sql:field="DIMENSION_IS_VISIBLE" name="DIMENSION_IS_VISIBLE" type="xsd:boolean"/>
        <xsd:element sql:field="HIERARCHY_IS_VISIBLE" name="HIERARCHY_IS_VISIBLE" type="xsd:boolean"/>
        <xsd:element sql:field="HIERARCHY_ORDINAL" name="HIERARCHY_ORDINAL" type="xsd:unsignedInt"/>
        <xsd:element sql:field="DIMENSION_IS_SHARED" name="DIMENSION_IS_SHARED" type="xsd:boolean"/>
        <xsd:element sql:field="PARENT_CHILD" name="PARENT_CHILD" type="xsd:boolean" minOccurs="0"/>
        <xsd:element sql:field="LEVELS" name="LEVELS" minOccurs="0"/>
    </xsd:sequence>
</xsd:complexType>
 * ```

 * ```xml
 <row>
    <CATALOG_NAME>FoodMart</CATALOG_NAME>
    <SCHEMA_NAME>FoodMart</SCHEMA_NAME>
    <CUBE_NAME>HR</CUBE_NAME>
    <DIMENSION_UNIQUE_NAME>[Department]</DIMENSION_UNIQUE_NAME>
    <HIERARCHY_NAME>Department</HIERARCHY_NAME>
    <HIERARCHY_UNIQUE_NAME>[Department]</HIERARCHY_UNIQUE_NAME>
    <HIERARCHY_CAPTION>Department</HIERARCHY_CAPTION>
    <DIMENSION_TYPE>3</DIMENSION_TYPE>
    <HIERARCHY_CARDINALITY>13</HIERARCHY_CARDINALITY>
    <DEFAULT_MEMBER>[Department].[All Departments]</DEFAULT_MEMBER>
    <ALL_MEMBER>[Department].[All Departments]</ALL_MEMBER>
    <DESCRIPTION>HR Cube - Department Hierarchy</DESCRIPTION>
    <STRUCTURE>0</STRUCTURE>
    <IS_VIRTUAL>false</IS_VIRTUAL>
    <IS_READWRITE>false</IS_READWRITE>
    <DIMENSION_UNIQUE_SETTINGS>0</DIMENSION_UNIQUE_SETTINGS>
    <DIMENSION_IS_VISIBLE>true</DIMENSION_IS_VISIBLE>
    <HIERARCHY_IS_VISIBLE>true</HIERARCHY_IS_VISIBLE>
    <HIERARCHY_ORDINAL>6</HIERARCHY_ORDINAL>
    <DIMENSION_IS_SHARED>true</DIMENSION_IS_SHARED>
    <PARENT_CHILD>false</PARENT_CHILD>
</row>
 * ```
 */
export interface MDXHierarchy extends PropertyHierarchy, MDXCube {
  dimensionUniqueName: string
  hierarchyName: string
  hierarchyUniqueName: string
  hierarchyGuid?: string
  hierarchyCaption: string
  dimensionType: number
  hierarchyCardinality: number
  defaultMember?: string
  allMember?: string
  description?: string
  structure: number
  isVirtual: boolean
  isReadwrite: boolean
  dimensionUniqueSettings: number
  dimensionIsVisible: boolean
  hierarchyIsVisible: boolean
  hierarchyOrdinal: number
  dimensionIsShared: boolean
  parentChild?: boolean
  levels?: Array<MDXLevel>
}

/**
 * ```xml
 * <xsd:complexType name="row">
    <xsd:sequence>
        <xsd:element sql:field="CATALOG_NAME" name="CATALOG_NAME" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="SCHEMA_NAME" name="SCHEMA_NAME" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="CUBE_NAME" name="CUBE_NAME" type="xsd:string"/>
        <xsd:element sql:field="DIMENSION_UNIQUE_NAME" name="DIMENSION_UNIQUE_NAME" type="xsd:string"/>
        <xsd:element sql:field="HIERARCHY_UNIQUE_NAME" name="HIERARCHY_UNIQUE_NAME" type="xsd:string"/>
        <xsd:element sql:field="LEVEL_NAME" name="LEVEL_NAME" type="xsd:string"/>
        <xsd:element sql:field="LEVEL_UNIQUE_NAME" name="LEVEL_UNIQUE_NAME" type="xsd:string"/>
        <xsd:element sql:field="LEVEL_GUID" name="LEVEL_GUID" type="uuid" minOccurs="0"/>
        <xsd:element sql:field="LEVEL_CAPTION" name="LEVEL_CAPTION" type="xsd:string"/>
        <xsd:element sql:field="LEVEL_NUMBER" name="LEVEL_NUMBER" type="xsd:unsignedInt"/>
        <xsd:element sql:field="LEVEL_CARDINALITY" name="LEVEL_CARDINALITY" type="xsd:unsignedInt"/>
        <xsd:element sql:field="LEVEL_TYPE" name="LEVEL_TYPE" type="xsd:int"/>
        <xsd:element sql:field="CUSTOM_ROLLUP_SETTINGS" name="CUSTOM_ROLLUP_SETTINGS" type="xsd:int"/>
        <xsd:element sql:field="LEVEL_UNIQUE_SETTINGS" name="LEVEL_UNIQUE_SETTINGS" type="xsd:int"/>
        <xsd:element sql:field="LEVEL_IS_VISIBLE" name="LEVEL_IS_VISIBLE" type="xsd:boolean"/>
        <xsd:element sql:field="DESCRIPTION" name="DESCRIPTION" type="xsd:string" minOccurs="0"/>
    </xsd:sequence>
</xsd:complexType>
 * ```
 * 
 * ```xml
 * <row>
    <CATALOG_NAME>FoodMart</CATALOG_NAME>
    <SCHEMA_NAME>FoodMart</SCHEMA_NAME>
    <CUBE_NAME>HR</CUBE_NAME>
    <DIMENSION_UNIQUE_NAME>[Department]</DIMENSION_UNIQUE_NAME>
    <HIERARCHY_UNIQUE_NAME>[Department]</HIERARCHY_UNIQUE_NAME>
    <LEVEL_NAME>(All)</LEVEL_NAME>
    <LEVEL_UNIQUE_NAME>[Department].[(All)]</LEVEL_UNIQUE_NAME>
    <LEVEL_CAPTION>(All)</LEVEL_CAPTION>
    <LEVEL_NUMBER>0</LEVEL_NUMBER>
    <LEVEL_CARDINALITY>1</LEVEL_CARDINALITY>
    <LEVEL_TYPE>1</LEVEL_TYPE>
    <CUSTOM_ROLLUP_SETTINGS>0</CUSTOM_ROLLUP_SETTINGS>
    <LEVEL_UNIQUE_SETTINGS>3</LEVEL_UNIQUE_SETTINGS>
    <LEVEL_IS_VISIBLE>true</LEVEL_IS_VISIBLE>
    <DESCRIPTION>HR Cube - Department Hierarchy - (All) Level</DESCRIPTION>
</row>
<row>
    <CATALOG_NAME>FoodMart</CATALOG_NAME>
    <SCHEMA_NAME>FoodMart</SCHEMA_NAME>
    <CUBE_NAME>HR</CUBE_NAME>
    <DIMENSION_UNIQUE_NAME>[Department]</DIMENSION_UNIQUE_NAME>
    <HIERARCHY_UNIQUE_NAME>[Department]</HIERARCHY_UNIQUE_NAME>
    <LEVEL_NAME>Department Description</LEVEL_NAME>
    <LEVEL_UNIQUE_NAME>[Department].[Department Description]</LEVEL_UNIQUE_NAME>
    <LEVEL_CAPTION>Department Description</LEVEL_CAPTION>
    <LEVEL_NUMBER>1</LEVEL_NUMBER>
    <LEVEL_CARDINALITY>12</LEVEL_CARDINALITY>
    <LEVEL_TYPE>0</LEVEL_TYPE>
    <CUSTOM_ROLLUP_SETTINGS>0</CUSTOM_ROLLUP_SETTINGS>
    <LEVEL_UNIQUE_SETTINGS>1</LEVEL_UNIQUE_SETTINGS>
    <LEVEL_IS_VISIBLE>true</LEVEL_IS_VISIBLE>
    <DESCRIPTION>HR Cube - Department Hierarchy - Department Description Level</DESCRIPTION>
</row>
 * ```
 */
export interface MDXLevel extends PropertyLevel, MDXCube {
  dimensionUniqueName: string
  hierarchyUniqueName: string
  levelName: string
  levelUniqueName: string
  levelGuid?: string
  levelCaption: string
  levelNumber: number
  levelCardinality: number
  customRollupSettings: number
  levelUniqueSettings: number
  levelIsVisible: boolean
  description?: string
}

/**
 * ```xml
 * <xsd:complexType name="row">
    <xsd:sequence>
        <xsd:element sql:field="CATALOG_NAME" name="CATALOG_NAME" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="SCHEMA_NAME" name="SCHEMA_NAME" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="CUBE_NAME" name="CUBE_NAME" type="xsd:string"/>
        <xsd:element sql:field="MEASURE_NAME" name="MEASURE_NAME" type="xsd:string"/>
        <xsd:element sql:field="MEASURE_UNIQUE_NAME" name="MEASURE_UNIQUE_NAME" type="xsd:string"/>
        <xsd:element sql:field="MEASURE_CAPTION" name="MEASURE_CAPTION" type="xsd:string"/>
        <xsd:element sql:field="MEASURE_GUID" name="MEASURE_GUID" type="uuid" minOccurs="0"/>
        <xsd:element sql:field="MEASURE_AGGREGATOR" name="MEASURE_AGGREGATOR" type="xsd:int"/>
        <xsd:element sql:field="DATA_TYPE" name="DATA_TYPE" type="xsd:unsignedShort"/>
        <xsd:element sql:field="MEASURE_IS_VISIBLE" name="MEASURE_IS_VISIBLE" type="xsd:boolean"/>
        <xsd:element sql:field="LEVELS_LIST" name="LEVELS_LIST" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="DESCRIPTION" name="DESCRIPTION" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="DEFAULT_FORMAT_STRING" name="DEFAULT_FORMAT_STRING" type="xsd:string" minOccurs="0"/>
    </xsd:sequence>
</xsd:complexType>
 * ```
 */
export interface MDXMeasure extends Property, MDXCube {
  measureName: string
  measureUniqueName: string
  measureCaption: string
  measureGuid?: string
  measureAggregator: number
  measureIsVisible: boolean
  levelsList?: string
  description?: string
  defaultFormatString?: string
}

/**
 * ```xml
 * <row>
    <CATALOG_NAME>FoodMart</CATALOG_NAME>
    <SCHEMA_NAME>FoodMart</SCHEMA_NAME>
    <CUBE_NAME>HR</CUBE_NAME>
    <DIMENSION_UNIQUE_NAME>[Department]</DIMENSION_UNIQUE_NAME>
    <HIERARCHY_UNIQUE_NAME>[Department]</HIERARCHY_UNIQUE_NAME>
    <LEVEL_UNIQUE_NAME>[Department].[Department Description]</LEVEL_UNIQUE_NAME>
    <LEVEL_NUMBER>1</LEVEL_NUMBER>
    <MEMBER_ORDINAL>11</MEMBER_ORDINAL>
    <MEMBER_NAME>18</MEMBER_NAME>
    <MEMBER_UNIQUE_NAME>[Department].[18]</MEMBER_UNIQUE_NAME>
    <MEMBER_TYPE>1</MEMBER_TYPE>
    <MEMBER_CAPTION>18</MEMBER_CAPTION>
    <CHILDREN_CARDINALITY>0</CHILDREN_CARDINALITY>
    <PARENT_LEVEL>0</PARENT_LEVEL>
    <PARENT_UNIQUE_NAME>[Department].[All Departments]</PARENT_UNIQUE_NAME>
    <PARENT_COUNT>1</PARENT_COUNT>
    <DEPTH>1</DEPTH>
</row>
 * ```
 *
 * ```xml
 * <xsd:complexType name="row">
    <xsd:sequence>
        <xsd:element sql:field="CATALOG_NAME" name="CATALOG_NAME" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="SCHEMA_NAME" name="SCHEMA_NAME" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="CUBE_NAME" name="CUBE_NAME" type="xsd:string"/>
        <xsd:element sql:field="DIMENSION_UNIQUE_NAME" name="DIMENSION_UNIQUE_NAME" type="xsd:string"/>
        <xsd:element sql:field="HIERARCHY_UNIQUE_NAME" name="HIERARCHY_UNIQUE_NAME" type="xsd:string"/>
        <xsd:element sql:field="LEVEL_UNIQUE_NAME" name="LEVEL_UNIQUE_NAME" type="xsd:string"/>
        <xsd:element sql:field="LEVEL_NUMBER" name="LEVEL_NUMBER" type="xsd:unsignedInt"/>
        <xsd:element sql:field="MEMBER_ORDINAL" name="MEMBER_ORDINAL" type="xsd:unsignedInt"/>
        <xsd:element sql:field="MEMBER_NAME" name="MEMBER_NAME" type="xsd:string"/>
        <xsd:element sql:field="MEMBER_UNIQUE_NAME" name="MEMBER_UNIQUE_NAME" type="xsd:string"/>
        <xsd:element sql:field="MEMBER_TYPE" name="MEMBER_TYPE" type="xsd:int"/>
        <xsd:element sql:field="MEMBER_GUID" name="MEMBER_GUID" type="uuid" minOccurs="0"/>
        <xsd:element sql:field="MEMBER_CAPTION" name="MEMBER_CAPTION" type="xsd:string"/>
        <xsd:element sql:field="CHILDREN_CARDINALITY" name="CHILDREN_CARDINALITY" type="xsd:unsignedInt"/>
        <xsd:element sql:field="PARENT_LEVEL" name="PARENT_LEVEL" type="xsd:unsignedInt"/>
        <xsd:element sql:field="PARENT_UNIQUE_NAME" name="PARENT_UNIQUE_NAME" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="PARENT_COUNT" name="PARENT_COUNT" type="xsd:unsignedInt"/>
        <xsd:element sql:field="TREE_OP" name="TREE_OP" type="xsd:string" minOccurs="0"/>
        <xsd:element sql:field="DEPTH" name="DEPTH" type="xsd:int" minOccurs="0"/>
    </xsd:sequence>
</xsd:complexType>
 * ```
 */
export interface MDXMember extends MDXCube, IDimensionMember {
  memberGuid?: string
  memberName: string
  memberCaption: string
  /**
   * @deprecated ? What's usage
   */
  memberIsVisible?: boolean
  childrenCardinality: number
  parentUniqueName?: string
  parentLevel: number
  parentCount: number
  treeOp?: string
  depth?: number
}

export function convertMDXProperty<T>(row): T {
  const property = {} as T
  Object.keys(row).forEach((key) => {
    const name = lowerFirst(
      key
        .split('_')
        .map((word) => upperFirst(lowerCase(word)))
        .join('')
    )
    property[name] = row[key]
  })
  return property
}

export function deconstructDimensionName(dimension: string) {
  return dimension.match(/\[(.*)\]/)?.[1]
}

// dimension or hierarchy field name regex
export const C_MDX_FIELD_NAME_REGEX = `[a-zA-Z0-9\u4E00-\u9FCC\\/\\s_\\-]*`

// Helpers
/**
 * 转换 XMLA 接口返回值, 去掉 Hierarchy 名称和单值的中括号 `[ ]`
 */
export function convertHierarchyMemberValue(hierarchy: string, value: string) {
  // const h = hierarchy.match(`^\\[(${C_MDX_FIELD_NAME_REGEX})\\]$`)
  // if (!h) {
  //   hierarchy = `[${hierarchy}]`
  // }
  value = value?.replace(`${hierarchy}.`, '')
  // const field = value?.match(`^\\[(${C_MDX_FIELD_NAME_REGEX})\\]$`)
  // if (field) {
  //   return field[1]
  // }
  return value
}

export function convertXmlaMember(hierarchyName: string, member: XmlaMember): MDXMember {
  return {
    memberKey: convertHierarchyMemberValue(hierarchyName, member.MEMBER_UNIQUE_NAME),
    catalogName: member.CATALOG_NAME,
    schemaName: member.SCHEMA_NAME,
    cubeName: member.CUBE_NAME,
    dimension: member.DIMENSION_UNIQUE_NAME,
    hierarchy: member.HIERARCHY_UNIQUE_NAME,
    level: member.LEVEL_UNIQUE_NAME,
    levelNumber: member.LEVEL_NUMBER,
    memberOrdinal: member.MEMBER_ORDINAL,
    memberName: member.MEMBER_NAME,
    memberUniqueName: member.MEMBER_UNIQUE_NAME,
    memberType: member.MEMBER_TYPE,
    memberGuid: member.MEMBER_GUID,
    memberCaption: member.MEMBER_CAPTION,
    childrenCardinality: member.CHILDREN_CARDINALITY,
    parentLevel: member.PARENT_LEVEL,
    parentUniqueName: member.PARENT_UNIQUE_NAME,
    parentCount: member.PARENT_COUNT,
    treeOp: member.TREE_OP,
    depth: member.DEPTH,
    parentKey: convertHierarchyMemberValue(hierarchyName, member.PARENT_UNIQUE_NAME)
  }
}
