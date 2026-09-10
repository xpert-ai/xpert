import { buildImportFolderTree, IMPORT_ROOT_FOLDER } from './import-folder-tree'

describe('document import folder tree', () => {
  it('builds nested destinations from parent IDs rather than path-like names', () => {
    const folders = [
      { id: 'child', name: 'Child', parent: { id: 'parent' } },
      { id: 'parent', name: 'Parent' },
      { id: 'literal', name: 'Parent/Other' }
    ]
    expect(buildImportFolderTree(folders, 'Root')).toMatchObject([
      {
        key: IMPORT_ROOT_FOLDER,
        caption: 'Root',
        children: [
          { key: 'parent', children: [{ key: 'child', caption: 'Child', children: [] }] },
          { key: 'literal', caption: 'Parent/Other', children: [] }
        ]
      }
    ])
    expect(folders.map((folder) => folder.id)).toEqual(['child', 'parent', 'literal'])
  })

  it('keeps missing-parent and cyclic historical folders reachable without infinite recursion', () => {
    const folders = [
      { id: 'a', name: 'A', parent: { id: 'b' } },
      { id: 'b', name: 'B', parent: { id: 'a' } },
      { id: 'orphan', name: 'Orphan', parent: { id: 'missing' } },
      { id: 'self', name: 'Self', parent: { id: 'self' } }
    ]
    expect(buildImportFolderTree(folders, 'Root')[0].children).toMatchObject([
      { key: 'orphan', children: [] },
      { key: 'self', children: [] },
      { key: 'a', children: [{ key: 'b', children: [] }] }
    ])
  })
})
