import { Cellset, C_MEASURES, Dataset, Dimension, EntityType, getEntityHierarchy, getEntityProperty, isMeasure, Property, wrapBrackets, CAPTION_FIELD_SUFFIX } from '@xpert-ai/ocap-core'
import { isNil, isEmpty, merge } from 'lodash'
import { IntrinsicMemberProperties } from '../reference'
import { Axis, convertHierarchyMemberValue, C_MDX_FIELD_NAME_REGEX, Dataset as XmlaDataset, _PivotColumn as PivotColumn } from '../types/index'
import { Xmla } from './Xmla'

export const MDX_MEASURE_NAME_REGEX = `\\[Measures\\]\\.\\[(${C_MDX_FIELD_NAME_REGEX})\\]`

export function fetchDataFromMultidimensionalTuple(dataset: XmlaDataset, entityType?: EntityType, mdx?: string): Dataset {

  let rowAxis: Axis
  try {
    rowAxis = dataset.getAxis(Xmla.Dataset.AXIS_ROWS)
  } catch (err) {
    // console.log(mdx, err)
  }

  const columnAxis = dataset.getAxis(Xmla.Dataset.AXIS_COLUMNS)
  const columnHierarchyCount = columnAxis.hierarchyCount()
  // const elements = {}
  const columns: PivotColumn[] = []
  const columnHierarchy: PivotColumn = {
    columns: [],
    memberType: null
  } as any

  const columnAxes = columnAxis.readAsArray().filter((axis) => axis).map((axis) => {
    const hierarchy = wrapBrackets(axis.hierarchy)
    const dimension = {
      hierarchy,
      index: axis.index,
    } as Dimension

    if (axis.hierarchy === C_MEASURES) {
      dimension.dimension = C_MEASURES
      if (isMeasure(dimension)) {
        // is Measure field
        const matchMeasure = axis['[Measures].[MEMBER_UNIQUE_NAME]'].match(new RegExp(MDX_MEASURE_NAME_REGEX))
        if (matchMeasure) {
          dimension.measure = matchMeasure[1]
        }
      }
    } else if(entityType) {
      dimension.dimension = getEntityHierarchy(entityType, hierarchy)?.dimension
      if (!dimension.dimension) {
        throw new Error(`Can't find dimension for hierarchy name '${hierarchy}'`)
      }
      dimension.level = axis[`${dimension.hierarchy}.[LEVEL_UNIQUE_NAME]`]
    }
    
    return dimension
  })

  columnAxis.eachTuple((tuple) => {
    let columnGroup = columnHierarchy
    let path = ''
    tuple.members.forEach((member) => {
      if (path) {
        path = path + '/'
      }

      const uniqueName = columnAxis.hierarchy(member.hierarchy).UName.name
      const caption = columnAxis.hierarchy(member.hierarchy).Caption.name
      // const hierarchyName = uniqueName.replace('.[MEMBER_UNIQUE_NAME]', '')
      const memberUniqueName = member[uniqueName]

      let uname = null
      let label = member[caption]
      // is Measure field
      const matchMeasure = memberUniqueName.match(new RegExp(MDX_MEASURE_NAME_REGEX))
      if (matchMeasure) {
        uname = matchMeasure[1]
        label = getEntityProperty(entityType, uname)?.caption || label
      } else {
        /**
         * 由于某些组件内部对带 `[]` 和 `.` 的属性不支持, 所以需要进行替换字符
         *
         * Columns:
         *
         * * `[Measures].[/CPMB/SDATA]` -> `/CPMB/SDATA`
         * * `[/CPMB/IKDCQ2K                 PARENTH1].[LEVEL01]` -> `_//CPMB/IKDCQ2K_________________PARENTH1_/LEVEL01`
         * * `[Measures].[PERIODIC]/[/CPMB/IKD2ZQE        PARENTH1].[2020.04]` -> `_/Measures_/PERIODIC/_//CPMB/IKD2ZQE_________________PARENTH1_/202004`
         */
        uname = memberUniqueName?.replace(/\./g, '').replace(/\s/g, '_').replace(/\[/g, '_/').replace(/\]/g, '')
      }

      path = path + uname
      // let column: PivotColumn = columnGroup.columns?.find((item) => item.member === uname)
      let column: PivotColumn = columnGroup.columns?.find((item) => item.name === path)
      if (!column) {
        column = {
          name: path,
          label,
          caption: label,
          dataType: 'number',
          // isSummary: member.MEMBER_TYPE === MemberType.MDMEMBER_TYPE_ALL || member.MEMBER_TYPE === MemberType.MDMEMBER_TYPE_MEASURE,
          member: {
            key: memberUniqueName,
            caption: label,
            value: memberUniqueName
          },
          uniqueName: memberUniqueName,
          parentUniqueName: member[`[${member.hierarchy}].[PARENT_UNIQUE_NAME]`]
        }
        if (matchMeasure) {
          column.measure = uname
        }
        if (member[`[${member.hierarchy}].[CHILDREN_CARDINALITY]`]) {
          column.childrenCardinality = Number(member[`[${member.hierarchy}].[CHILDREN_CARDINALITY]`])
        }
        columnGroup.columns = columnGroup.columns || []
        columnGroup.columns.push(column)
      }
      columnGroup = column
    })
    columns.push(columnGroup)

    return true
  })

  // const hasParent = rowAxis?.hasMemberProperty('PARENT_UNIQUE_NAME')
  const rows = []
  rowAxis?.eachTuple((tuple) => {
    const row = {}
    tuple.members.forEach((member) => {
      merge(row, member)

      const uniqueName = rowAxis.hierarchy(member.hierarchy).UName.name
      const caption = rowAxis.hierarchy(member.hierarchy).Caption.name
      const hierarchyName = uniqueName.replace('.[MEMBER_UNIQUE_NAME]', '')
      row[hierarchyName] = convertHierarchyMemberValue(hierarchyName, member[uniqueName])
      row[caption.replace('.[MEMBER_CAPTION]', '') + CAPTION_FIELD_SUFFIX] = member[caption]
      row[member[`[${member.hierarchy}].[LEVEL_UNIQUE_NAME]`]] = row[hierarchyName]

      Object.keys(IntrinsicMemberProperties).forEach((name) => {
        if (IntrinsicMemberProperties[name] > 0) {
          const intrinsicMemberProperty = `[${member.hierarchy}].[${name}]`
          if (!isNil(member[intrinsicMemberProperty])) {
            if (name === IntrinsicMemberProperties[IntrinsicMemberProperties.PARENT_UNIQUE_NAME]) {
              row[intrinsicMemberProperty] = convertHierarchyMemberValue(`[${member.hierarchy}]`, member[intrinsicMemberProperty])
            } else {
              row[intrinsicMemberProperty] = member[intrinsicMemberProperty]
            }
          }
        }
      })

      // const memberUniqueName = convertHierarchyMemberValue(member.hierarchy.split('.')[0], member[uniqueName])
      // row[`[${member.hierarchy}]`] = memberUniqueName
      // row[`[${member.hierarchy}]_Text`] = member[`[${member.hierarchy}].[MEMBER_CAPTION]`]

      // row[member[Xmla.Dataset.Axis.MEMBER_LEVEL_NAME]] = memberUniqueName
      // row[member[Xmla.Dataset.Axis.MEMBER_LEVEL_NAME] + '_Text'] = member[Xmla.Dataset.Axis.MEMBER_CAPTION]
      // row[`[${member.hierarchy}].[LEVEL]`] = member[Xmla.Dataset.Axis.MEMBER_LEVEL_NUMBER]

      // User-Defined Member Properties (SAP BW MDX)
      // Object.keys(member).forEach((key) => {
      //   if (key.startsWith('_')) {
      //     // row[`[${member.hierarchy}].[${key.slice(1).replace(/_/g, '/')}]`] = member[key]
      //     // SmartGrid 组件会对字段命中有 . 作为属性路径进行处理, 所以使用不带点的属性
      //     row[`[${member.hierarchy}][${key.slice(1).replace(/_/g, '/')}]`] = member[key]
      //   }
      // })
    })
    rows.push(row)

    return true
  })

  const rowColumns: Property[] = []
  rowAxis?.eachHierarchy((hierarchy) => {
    // console.warn(hierarchy)
    const name = hierarchy.UName.name.replace('.[MEMBER_UNIQUE_NAME]', '')
    const column: Property = {
      name,
      dataType: 'string',
      text: {
        name: name + CAPTION_FIELD_SUFFIX,
        dataType: 'string'
      }
    }
    /**
     * for SAP Dimension Properties `{[2CRVIAREA].[level01].Members} DIMENSION PROPERTIES [2CRVIAREA].[22CRVIAREA-LASTCHANGEDBY] ON ROWS`
     * ```xml
     * <Tuple>
     *      <Member Hierarchy="2CRVIAREA">
     *          <UName>[2CRVIAREA].[/CPMB/MIREPORT_TEST_LX]</UName>
     *          <Caption>集团管理报表模型</Caption>
     *          <LName>[2CRVIAREA].[LEVEL01]</LName>
     *          <LNum>1</LNum>
     *          <DisplayInfo>131072</DisplayInfo>
     *          <PARENT_UNIQUE_NAME xsi:type="xsd:string">[/CPMB/AIDJYGO                 PARENTH1].[E_ALL                           /CPMB/AIDJYGO]</PARENT_UNIQUE_NAME>
     *          <CHILDREN_CARDINALITY xsi:type="xsd:string">000001</CHILDREN_CARDINALITY>
     *          <_22CRVIAREA-LASTCHANGEDBY xsi:type="xsd:string">BPC_SERVICE</_22CRVIAREA-LASTCHANGEDBY>
     *      </Member>
     * </Tuple>
     * ```
     */
    Object.keys(hierarchy)
      .filter((key) => !['index', 'name', 'UName', 'Caption', 'LName', 'LNum', 'DisplayInfo'].includes(key))
      .forEach((key) => {
        column.properties = column.properties || []
        column.properties.push({
          // name: key,
          name: hierarchy[key].name,
          dataType: 'string'
        })
      })
    rowColumns.push(column)

    // if (hasParent) {
    //   const parentName = convertHierarchyParentName(name)
    //   rowColumns.push({
    //     name: parentName,
    //     dataType: 'string',
    //     hierarchyParentNodeFor: name
    //   })
    // }

    Object.keys(IntrinsicMemberProperties).forEach((name) => {
      if (IntrinsicMemberProperties[name] > 0 && hierarchy[name]) {
        rowColumns.push({
          name: hierarchy[name].name,
          dataType: 'string',
        })
      }
    })
  })

  const cellset = dataset.getCellset()
  const rowHierarchyCount = rowAxis?.hierarchyCount() || 0
  // 对于纯 COLUMNS 情况至少有一行
  if (rows.length === 0) {
    rows.push({})
  }
  // console.warn(columnAxis.hierarchyCount())
  let ordinal = 0
  for (let i = columnAxis.hierarchyCount(), maxI = i + (rowAxis?.tupleCount() || 1); i < maxI; i++) {
    // console.warn(`row ${i}`)
    const row = rows[i - columnHierarchyCount]
    // console.warn(columnAxis.tupleCount())
    for (let j = rowHierarchyCount, maxJ = j + columnAxis.tupleCount(); j < maxJ; j++) {
      // console.warn(`column ${j}`)
      try {
        // cellValue() 在 cellValue 空时会报错
        const columnName = columns[j - rowHierarchyCount].name
        // row[columnName] = cellset.cellValue()
        const cell = cellset.getByOrdinal(ordinal)
        ordinal++
        if (cell === null) {
          continue
        }
        row[columnName] = cell.Value
        if (cell.Currency) {
          row[`${columnName}_Currency`] = cell.Currency
        }
        if (cell.Unit) {
          row[`${columnName}_Unit`] = cell.Unit
        }
        // const currency = cellset.cellProperty('Currency')
        // if (currency) {
        //   row[`${columnName}_Currency`] = currency
        // }
        // const unit = cellset.cellProperty('Unit')
        // if (unit) {
        //   row[`${columnName}_Unit`] = unit
        // }
        // cellset.nextCell()
      } catch (err) {
        // rows.splice(0, rows.length)
      }
    }
  }

  if (rows?.length === 1) {
    // 在没有 measure数据并且没有 dimensions 数据清空下清空第一行
    if (isEmpty(rows[0])) {
      rows.splice(0, rows.length)
    }
  }

  return {
    data: rows,
    columns: columnHierarchy.columns,
    rows: rowColumns,
    // cellset: getCellsetFromXmlaDateset(dataset, rows, columns),
    columnAxes,
  } as any
}

export function convertHierarchyName(name) {
  return name?.replace(/\s/g, '_')
}
export function convertHierarchyParentName(name) {
  return name + '.[PARENT_UNIQUE_NAME]'
}

export function getCellsetFromXmlaDateset(
  dataset: XmlaDataset,
  rows: Array<unknown>,
  columns: Array<{ name: string }>
): Cellset {
  let rowAxis: Axis
  let columnAxis: Axis
  try {
    rowAxis = dataset.getAxis(Xmla.Dataset.AXIS_ROWS)
    columnAxis = dataset.getAxis(Xmla.Dataset.AXIS_COLUMNS)
  } catch (err) {
    console.log(err)
  }

  const cellset = dataset.getCellset()
  const rowHierarchyCount = rowAxis?.hierarchyCount() || 0

  const data = [] as Cellset
  let ordinal = 0
  for (let i = columnAxis?.hierarchyCount(), maxI = i + (rowAxis?.tupleCount() || 1); i < maxI; i++) {
    const row = []
    for (let j = rowHierarchyCount, maxJ = j + columnAxis.tupleCount(); j < maxJ; j++) {
      const columnIndex = j - rowHierarchyCount
      try {
        const cell = cellset.getByOrdinal(ordinal)
        ordinal++
        if (cell === null) {
          continue
        }
        row[columnIndex] = cell.Value
      } catch (err) {
        //
      }
    }
    data.push(row)
  }

  return data
}
