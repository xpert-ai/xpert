import { HttpHeaders, RuntimeLevelType } from '@xpert-ai/ocap-core'

export interface Rowset {
  fetchAllAsObject(): any
}

export enum XmlaFormat {
  Tabular = 'Tabular',
  Multidimensional = 'Multidimensional'
}

export interface MDOptions {
  // requestType: ''
  properties?: {
    DataSourceInfo?: string
    Catalog?: string
    Format?: XmlaFormat
  }
  restrictions?: {
    CATALOG_NAME?: string
    CUBE_NAME?: string
    DIMENSION_UNIQUE_NAME?: string
    HIERARCHY_UNIQUE_NAME?: string
    LEVEL_UNIQUE_NAME?: string
    LEVEL_NUMBER?: number
  }
  headers?: HttpHeaders
  forceRefresh?: boolean | void
}

/**
 * ```xml
 * <xsd:sequence minOccurs="0" maxOccurs="unbounded">
 *    <xsd:element name="CATALOG_NAME" type="xsd:string" sql:field="CATALOG_NAME" minOccurs="0"/>
 *    <xsd:element name="SCHEMA_NAME" type="xsd:string" sql:field="SCHEMA_NAME" minOccurs="0"/>
 *    <xsd:element name="DESCRIPTION" type="xsd:string" sql:field="DESCRIPTION" minOccurs="0"/>
 * </xsd:sequence>
 * ```
 */
export interface XmlaSchemaCatalog {
  CATALOG_NAME: string
  SCHEMA_NAME: string
  DESCRIPTION: string
}

/**
 * MDSCHEMA_CUBES result format:
 * 1. Mondrian:
 * <row>
    <CATALOG_NAME>Demo - FoodMart Model</CATALOG_NAME>
    <SCHEMA_NAME>Demo - FoodMart Model</SCHEMA_NAME>
    <CUBE_NAME>Sales</CUBE_NAME>
    <CUBE_TYPE>CUBE</CUBE_TYPE>
    <LAST_SCHEMA_UPDATE>2022-09-12T17:49:00</LAST_SCHEMA_UPDATE>
    <IS_DRILLTHROUGH_ENABLED>true</IS_DRILLTHROUGH_ENABLED>
    <IS_WRITE_ENABLED>false</IS_WRITE_ENABLED>
    <IS_LINKABLE>false</IS_LINKABLE>
    <IS_SQL_ENABLED>false</IS_SQL_ENABLED>
    <CUBE_CAPTION>销售</CUBE_CAPTION>
    <DESCRIPTION>Demo - FoodMart Model Schema - Sales Cube</DESCRIPTION>
  </row>

  2. SAP BW:
  <row>
    <CATALOG_NAME>$INFOCUBE</CATALOG_NAME>
    <CUBE_NAME>$/CPMB/AJIN09O</CUBE_NAME>
    <CUBE_TYPE>CUBE</CUBE_TYPE>
    <LAST_SCHEMA_UPDATE>2019-04-12T02:41:40</LAST_SCHEMA_UPDATE>
    <SCHEMA_UPDATED_BY>BPC_SERVICE</SCHEMA_UPDATED_BY>
    <LAST_DATA_UPDATE>1970-01-01T00:00:00</LAST_DATA_UPDATE>
    <DESCRIPTION>Planning</DESCRIPTION>
    <IS_DRILLTHROUGH_ENABLED>false</IS_DRILLTHROUGH_ENABLED>
    <IS_LINKABLE>false</IS_LINKABLE>
    <IS_WRITE_ENABLED>false</IS_WRITE_ENABLED>
    <IS_SQL_ENABLED>false</IS_SQL_ENABLED>
  </row>
 *  
 */
export interface XmlaCube {
  CATALOG_NAME: string
  SCHEMA_NAME: string
  CUBE_NAME: string
  CUBE_TYPE: string
  LAST_SCHEMA_UPDATE: string
  IS_DRILLTHROUGH_ENABLED: boolean
  IS_WRITE_ENABLED: boolean
  IS_LINKABLE: boolean
  IS_SQL_ENABLED: boolean
  CUBE_CAPTION: string
  DESCRIPTION: string
}

export interface XmlaDimension {
  CATALOG_NAME: string
  CUBE_NAME: string
  DEFAULT_HIERARCHY: string
  DESCRIPTION: string
  DIMENSION_CAPTION: string
  DIMENSION_CARDINALITY: number
  DIMENSION_GUID: string
  DIMENSION_IS_VISIBLE: boolean
  DIMENSION_NAME: string
  DIMENSION_ORDINAL: number
  DIMENSION_TYPE: DIMENSION_TYPE
  DIMENSION_UNIQUE_NAME: string
  SCHEMA_NAME: string
}

export interface Hierarchy {
  ALL_MEMBER: string
  CATALOG_NAME: string
  CUBE_NAME: string
  DEFAULT_MEMBER: string
  DESCRIPTION: string
  DIMENSION_TYPE: DIMENSION_TYPE
  DIMENSION_UNIQUE_NAME: string
  HIERARCHY_CAPTION: string
  HIERARCHY_CARDINALITY: number
  HIERARCHY_GUID: string
  HIERARCHY_IS_VISIBLE: boolean
  HIERARCHY_NAME: string
  HIERARCHY_UNIQUE_NAME: string
  SCHEMA_NAME: string
  STRUCTURE: number
}

export interface Level {
  CATALOG_NAME: string
  CUBE_NAME: string
  DESCRIPTION: string
  DIMENSION_UNIQUE_NAME: string
  HIERARCHY_UNIQUE_NAME: string
  LEVEL_CAPTION: string
  LEVEL_CARDINALITY: number
  LEVEL_IS_VISIBLE: boolean
  LEVEL_NAME: string
  LEVEL_NUMBER: number
  LEVEL_TYPE: RuntimeLevelType
  LEVEL_UNIQUE_NAME: string
  SCHEMA_NAME: string
}

export enum MondrianDataType {
  None = 0,
  Boolean = 1,
  Double = 2,
  Integer = 3,
  String = 4,
  Numeric = 5,
  // 不确定 130 一定是 formula 生成的， 但可以通过对 formula 设置 dataType 指定类型
  Formula = 130,
}

/**
 * Values in DATATYPE domain https://www.sapdatasheet.org/abap/doma/datatype.html#values
 * Classify by ChatGPT
 */
export enum SAPBWDataType {
  ACCP = 'String', // Posting period YYYYMM is a character string format
  CHAR = 'String', // Character String
  CLNT = 'Integer', // Client is a 4-byte integer field
  CUKY = 'String', // Currency key is a character string format
  CURR = 'Numeric', // Currency field, stored as DEC
  D16D = 'Numeric', // Decimal Floating Point, 16 Digits, DEC on Database
  D16R = 'Numeric', // Decimal Floating Point, 16 Digits, RAW on Database
  D16S = 'Numeric', // Decimal Floating Point. 16 Digits, with Scale Field
  D34D = 'Numeric', // Decimal Floating Point, 34 Digits, DEC on Database
  D34R = 'Numeric', // Decimal Floating Point, 34 Digits, RAW on Database
  D34S = 'Numeric', // Decimal Floating Point, 34 Digits, with Scale Field
  DATS = 'Date', // Date field (YYYYMMDD) stored as char(8)
  DEC  = 'Numeric', // Counter or amount field with comma and sign
  FLTP = 'Numeric', // Floating point number, accurate to 8 bytes
  INT1 = 'Integer', // 1-byte integer, integer number <= 255
  INT2 = 'Integer', // 2-byte integer, only for length field before LCHR or LRAW
  INT4 = 'Integer', // 4-byte integer, integer number with sign
  LANG = 'String', // Language key is a character string format
  LCHR = 'String', // Long character string, requires preceding INT2 field
  LRAW = 'String', // Long byte string, requires preceding INT2 field
  NUMC = 'String', // Character string with only digits
  PREC = 'Annotation', // Obsolete data type, do not use
  QUAN = 'Numeric', // Quantity field, points to a unit field with format UNIT
  RAW  = 'Numeric', // Uninterpreted sequence of bytes
  RSTR = 'String', // Byte String of Variable Length
  SSTR = 'String', // Short Character String of Variable Length
  STRG = 'String', // Character String of Variable Length
  TIMS = 'Datetime', // Time field (hhmmss), stored as char(6)
  UNIT = 'String', // Unit key for QUAN fields is a character string format
  VARC = 'Annotation', // Long character string, no longer supported from Rel. 3.0
}

export interface Meaure {
  CATALOG_NAME: string
  CUBE_NAME: string
  DATA_TYPE: MondrianDataType | SAPBWDataType | string
  DESCRIPTION: string
  EXPRESSION: string
  MEASURE_AGGREGATOR: number
  MEASURE_CAPTION: string
  MEASURE_GUID: string
  MEASURE_IS_VISIBLE: true
  MEASURE_NAME: string
  MEASURE_UNIQUE_NAME: string
  MEASURE_UNITS: string
  NUMERIC_PRECISION: number
  NUMERIC_SCALE: number
  SCHEMA_NAME: string
}

/**
 * <row>
    <CATALOG_NAME>ZCPFI0005</CATALOG_NAME>
    <CUBE_NAME>ZCPFI0005/ZCPFI0005_Q001</CUBE_NAME>
    <DIMENSION_UNIQUE_NAME>[ZCOMPCODE]</DIMENSION_UNIQUE_NAME>
    <HIERARCHY_UNIQUE_NAME>[ZCOMPCODE]</HIERARCHY_UNIQUE_NAME>
    <LEVEL_UNIQUE_NAME>[ZCOMPCODE].[LEVEL01]</LEVEL_UNIQUE_NAME>
    <PROPERTY_TYPE>1</PROPERTY_TYPE>
    <PROPERTY_NAME>[5ZCOMPCODE]</PROPERTY_NAME>
    <PROPERTY_CAPTION>中间名</PROPERTY_CAPTION>
    <DATA_TYPE>CHAR</DATA_TYPE>
    <MAX_LENGTH>40</MAX_LENGTH>
  </row>
 */
export interface XmlaProperty {
  CATALOG_NAME: string
  CUBE_NAME: string
  DIMENSION_UNIQUE_NAME: string
  HIERARCHY_UNIQUE_NAME: string
  LEVEL_UNIQUE_NAME: string
  PROPERTY_TYPE: number
  PROPERTY_NAME: string
  PROPERTY_CAPTION: string
  DESCRIPTION: string
  DATA_TYPE: string
  MAX_LENGTH: number
}

/**
 * <row>
      <CATALOG_NAME>ZCPSRM0002</CATALOG_NAME>
      <CUBE_NAME>ZCPSRM0002/ZCPSRM0002_Q012</CUBE_NAME>
      <VARIABLE_NAME>[!V000002]</VARIABLE_NAME>
      <VARIABLE_CAPTION>日历日-区间</VARIABLE_CAPTION>
      <VARIABLE_GUID>005056AA-33EA-1EE9-B099-F7BEEFD55AB6</VARIABLE_GUID>
      <VARIABLE_ORDINAL>2</VARIABLE_ORDINAL>
      <VARIABLE_TYPE>1</VARIABLE_TYPE>
      <DATA_TYPE>CHAR</DATA_TYPE>
      <MAX_LENGTH>143</MAX_LENGTH>
      <VARIABLE_PROCESSING_TYPE>1</VARIABLE_PROCESSING_TYPE>
      <VARIABLE_SELECTION_TYPE>2</VARIABLE_SELECTION_TYPE>
      <VARIABLE_ENTRY_TYPE>0</VARIABLE_ENTRY_TYPE>
      <REFERENCE_DIMENSION>[0DOC_DATE]</REFERENCE_DIMENSION>
      <REFERENCE_HIERARCHY>[0DOC_DATE]</REFERENCE_HIERARCHY>
      <DESCRIPTION>日历日-区间</DESCRIPTION>
  </row>
  <row>
      <CATALOG_NAME>ZCPSRM0002</CATALOG_NAME>
      <CUBE_NAME>ZCPSRM0002/ZCPSRM0002_Q012</CUBE_NAME>
      <VARIABLE_NAME>[!V000003]</VARIABLE_NAME>
      <VARIABLE_CAPTION>供应商组号手工输入</VARIABLE_CAPTION>
      <VARIABLE_GUID>005056AA-33EA-1EDB-A6D2-AC4D98F10911</VARIABLE_GUID>
      <VARIABLE_ORDINAL>3</VARIABLE_ORDINAL>
      <VARIABLE_TYPE>1</VARIABLE_TYPE>
      <DATA_TYPE>CHAR</DATA_TYPE>
      <MAX_LENGTH>143</MAX_LENGTH>
      <VARIABLE_PROCESSING_TYPE>1</VARIABLE_PROCESSING_TYPE>
      <VARIABLE_SELECTION_TYPE>1</VARIABLE_SELECTION_TYPE>
      <VARIABLE_ENTRY_TYPE>0</VARIABLE_ENTRY_TYPE>
      <REFERENCE_DIMENSION>[ZVENGPNO]</REFERENCE_DIMENSION>
      <REFERENCE_HIERARCHY>[ZVENGPNO]</REFERENCE_HIERARCHY>
      <DESCRIPTION>供应商组号手工输入</DESCRIPTION>
  </row>
 */
export interface Variable {
  CATALOG_NAME: string
  CUBE_NAME: string
  VARIABLE_NAME: string
  VARIABLE_CAPTION: string
  REFERENCE_DIMENSION: string
  REFERENCE_HIERARCHY: string
  DEFAULT_LOW: string
  DEFAULT_HIGH: string
}

/**
 * The type of the dimension
 * https://docs.microsoft.com/en-us/previous-versions/sql/sql-server-2012/ms126180(v=sql.110)
 */
export enum DIMENSION_TYPE {
  MD_DIMTYPE_UNKNOWN = 0,
  MD_DIMTYPE_TIME = 1,
  MD_DIMTYPE_MEASURE = 2,
  MD_DIMTYPE_OTHER = 3,
  MD_DIMTYPE_STRUCTURE = 4, // ? MS 文档里缺少这个
  MD_DIMTYPE_QUANTITATIVE = 5,
  MD_DIMTYPE_ACCOUNTS = 6,
  MD_DIMTYPE_CUSTOMERS = 7,
  MD_DIMTYPE_PRODUCTS = 8,
  MD_DIMTYPE_SCENARIO = 9,
  MD_DIMTYPE_UTILIY = 10,
  MD_DIMTYPE_CURRENCY = 11,
  MD_DIMTYPE_RATES = 12,
  MD_DIMTYPE_CHANNEL = 13,
  MD_DIMTYPE_PROMOTION = 14,
  MD_DIMTYPE_ORGANIZATION = 15,
  MD_DIMTYPE_BILL_OF_MATERIALS = 16,
  MD_DIMTYPE_GEOGRAPHY = 17
}

/**
 *  MDMember type
{
  "CATALOG_NAME": "Demo - FoodMart Model",
  "SCHEMA_NAME": "Demo - FoodMart Model",
  "CUBE_NAME": "Sales",
  "DIMENSION_UNIQUE_NAME": "[Store]",
  "HIERARCHY_UNIQUE_NAME": "[Store]",
  "LEVEL_UNIQUE_NAME": "[Store].[(All)]",
  "LEVEL_NUMBER": 0,
  "MEMBER_ORDINAL": 0,
  "MEMBER_NAME": "All Stores",
  "MEMBER_UNIQUE_NAME": "[Store].[All Stores]",
  "MEMBER_TYPE": 2,
  "MEMBER_GUID": null,
  "MEMBER_CAPTION": "All Stores",
  "CHILDREN_CARDINALITY": 3,
  "PARENT_LEVEL": 0,
  "PARENT_UNIQUE_NAME": null,
  "PARENT_COUNT": 0,
  "TREE_OP": null,
  "DEPTH": 0
}
*/
export interface XmlaMember {
  CATALOG_NAME: string
  SCHEMA_NAME: string
  CUBE_NAME: string
  DIMENSION_UNIQUE_NAME: string
  HIERARCHY_UNIQUE_NAME: string
  LEVEL_UNIQUE_NAME: string
  LEVEL_NUMBER: number
  MEMBER_ORDINAL: number
  MEMBER_NAME: string
  MEMBER_UNIQUE_NAME: string
  MEMBER_TYPE: number
  MEMBER_GUID: string
  MEMBER_CAPTION: string
  CHILDREN_CARDINALITY: number
  PARENT_LEVEL: number
  PARENT_UNIQUE_NAME: string
  PARENT_COUNT: number
  TREE_OP: string
  DEPTH: number
}
