import type { EvolutionPage } from '@xpert-ai/contracts'

export async function loadAllEvolutionPages<T>(readPage: (page: number) => Promise<EvolutionPage<T>>): Promise<T[]> {
  const items: T[] = []
  let page = 1
  while (true) {
    const result = await readPage(page)
    items.push(...result.items)
    if (!result.items.length || page * result.pageSize >= result.total) return items
    page++
  }
}
