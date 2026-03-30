import { DisplayBehaviour, TreeNodeInterface } from '@metad/ocap-core'
import {
  displayTreeSelectText,
  findTreeSelectNode,
  filterTreeSelectNodes,
  getInitialExpandedKeys,
  normalizeTreeSelectValue
} from './tree-select.utils'

const TREE_NODES: TreeNodeInterface<unknown>[] = [
  {
    key: 'root',
    caption: null,
    label: 'Root',
    raw: null,
    children: [
      {
        key: 'child-a',
        caption: null,
        label: 'Child A',
        raw: null
      },
      {
        key: 'child-b',
        caption: null,
        raw: null,
        children: [
          {
            key: 'grandchild-b1',
            caption: null,
            label: 'Grandchild B1',
            raw: null
          }
        ]
      }
    ]
  }
]

describe('tree-select utils', () => {
  it('falls back to the key when the node has no label', () => {
    expect(displayTreeSelectText({ key: 'child-b' })).toBe('child-b')
  })

  it('normalizes combobox values into a single selected key', () => {
    expect(normalizeTreeSelectValue('child-a')).toBe('child-a')
    expect(normalizeTreeSelectValue(['child-a', 'child-b'])).toBe('child-a')
    expect(normalizeTreeSelectValue('')).toBeNull()
  })

  it('finds the selected node even when the original key is not a string', () => {
    const treeNodes: TreeNodeInterface<unknown>[] = [
      {
        key: 101 as unknown as string,
        caption: 'Numeric Node',
        raw: null
      }
    ]

    expect(findTreeSelectNode(treeNodes, '101')?.caption).toBe('Numeric Node')
  })

  it('filters tree nodes while keeping matching ancestors', () => {
    const filtered = filterTreeSelectNodes(TREE_NODES, 'Grandchild', DisplayBehaviour.descriptionOnly)

    expect(filtered).toHaveLength(1)
    expect(filtered[0].key).toBe('root')
    expect(filtered[0].children?.[0]?.key).toBe('child-b')
    expect(filtered[0].children?.[0]?.children?.[0]?.key).toBe('grandchild-b1')
  })

  it('returns initial expanded keys for tree viewer mode', () => {
    expect(
      getInitialExpandedKeys(
        [
          { key: 'root', level: 0 },
          { key: 'child-a', level: 1 },
          { key: 'grandchild-b1', level: 2 }
        ],
        2,
        ''
      )
    ).toEqual(['root', 'child-a'])
  })
})
