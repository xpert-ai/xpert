import { toToolsetWriteInput } from './xpert-toolset.input'
import { IXpertToolset } from './xpert-toolset.model'

describe('toolset editor payload', () => {
  it('serializes finite write fields even when editor state contains circular entity relations', () => {
    const toolset: IXpertToolset = {
      id: 'toolset-1',
      name: 'Example',
      createdBy: { id: 'user-1' },
      tools: [{ id: 'tool-1', name: 'search' }],
      tags: [
        { id: 'tag-1', name: 'Existing' },
        { id: undefined, name: 'Imported' }
      ]
    }
    toolset.tools![0].toolset = toolset
    const serialized = JSON.parse(JSON.stringify(toToolsetWriteInput(toolset)))
    expect(serialized).toEqual({
      name: 'Example',
      tools: [{ id: 'tool-1', name: 'search' }],
      tags: [{ id: 'tag-1' }, { name: 'Imported' }]
    })
  })

  it('distinguishes omitted fields from explicit clears', () => {
    expect(JSON.parse(JSON.stringify(toToolsetWriteInput({ name: 'New' })))).toEqual({ name: 'New' })
    expect(JSON.parse(JSON.stringify(toToolsetWriteInput({ tools: [], tags: null, credentials: null })))).toEqual({
      tools: [],
      tags: null,
      credentials: null
    })
  })
})
