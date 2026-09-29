import { loadAllEvolutionPages } from './evolution-pagination'

describe('loadAllEvolutionPages', () => {
  it('loads beyond the first page using the actual server page size', async () => {
    const read = jest.fn(async (page: number) => ({
      page,
      pageSize: 2,
      total: 3,
      items: page === 1 ? ['first', 'second'] : ['third']
    }))
    expect(await loadAllEvolutionPages(read)).toEqual(['first', 'second', 'third'])
    expect(read.mock.calls).toEqual([[1], [2]])
  })

  it('stops when records disappear between page requests', async () => {
    const read = jest.fn(async (page: number) => ({
      page,
      pageSize: 1,
      total: 5,
      items: page === 1 ? ['first'] : []
    }))
    expect(await loadAllEvolutionPages(read)).toEqual(['first'])
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('does not report partial results as a complete registry when a page fails', async () => {
    const read = jest.fn(async (page: number) => {
      if (page === 2) throw new Error('Permission changed')
      return { page, pageSize: 1, total: 2, items: ['first'] }
    })
    await expect(loadAllEvolutionPages(read)).rejects.toThrow('Permission changed')
  })
})
