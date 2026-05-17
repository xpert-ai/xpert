import { getVariableSchema, TWorkflowVarGroup, XpertParameterTypeEnum } from '../../@core/types'
import { expandVariablesWithItems } from './types'

describe('agent variable helpers', () => {
  it('recursively expands object item fields under iterator variables', () => {
    const groups = [
      {
        group: {
          name: 'iterator_abc_channel',
          description: 'Iterator'
        },
        variables: [
          {
            name: '$item',
            type: XpertParameterTypeEnum.OBJECT,
            description: 'Current item',
            item: [
              {
                name: 'fileType',
                type: XpertParameterTypeEnum.STRING,
                description: 'File type'
              },
              {
                name: 'metadata',
                type: XpertParameterTypeEnum.OBJECT,
                description: 'Metadata',
                item: [
                  {
                    name: 'pageNo',
                    type: XpertParameterTypeEnum.NUMBER,
                    description: 'Page number'
                  }
                ]
              }
            ]
          },
          {
            name: 'files',
            type: XpertParameterTypeEnum.ARRAY,
            description: 'Files',
            item: [
              {
                name: 'status',
                type: XpertParameterTypeEnum.STRING,
                description: 'Status'
              }
            ]
          }
        ]
      }
    ] as TWorkflowVarGroup[]

    const expanded = expandVariablesWithItems(groups)
    const variables = expanded[0].variables

    expect(variables.map((variable) => variable.name)).toEqual([
      '$item',
      '$item.fileType',
      '$item.metadata',
      '$item.metadata.pageNo',
      'files',
      'files.status'
    ])
    expect(getVariableSchema(expanded, 'iterator_abc_channel.$item.fileType').variable?.type).toBe(
      XpertParameterTypeEnum.STRING
    )
  })

  it('resolves ungrouped dotted variable paths after expansion', () => {
    const groups = [
      {
        variables: [
          {
            name: '$item',
            type: XpertParameterTypeEnum.OBJECT,
            description: 'Current item',
            item: [
              {
                name: 'fileType',
                type: XpertParameterTypeEnum.STRING,
                description: 'File type'
              }
            ]
          }
        ]
      }
    ] as TWorkflowVarGroup[]

    const expanded = expandVariablesWithItems(groups)

    expect(getVariableSchema(expanded, '$item.fileType').variable?.type).toBe(XpertParameterTypeEnum.STRING)
  })

  it('keeps simple variables while adding file child fields', () => {
    const groups = [
      {
        variables: [
          {
            name: 'plain',
            type: XpertParameterTypeEnum.STRING,
            description: 'Plain variable'
          },
          {
            name: 'file',
            type: XpertParameterTypeEnum.FILE,
            description: 'File variable'
          }
        ]
      }
    ] as TWorkflowVarGroup[]

    const expanded = expandVariablesWithItems(groups)

    expect(expanded[0].variables.map((variable) => variable.name)).toEqual([
      'plain',
      'file',
      'file.filePath',
      'file.fileName',
      'file.fileUrl',
      'file.fileSize',
      'file.mimeType'
    ])
  })
})
