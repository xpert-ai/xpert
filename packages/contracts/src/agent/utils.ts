import { TXpertGraph } from '../ai/xpert.model'

/**
 * Channels of all upstream and downstream nodes relative to the starting point startKey.
 *
 * @param graph
 * @param startKey
 */
export function allChannels(graph: TXpertGraph, startKey: string) {
  const upstream = new Set<string>()
  const downstream = new Set<string>()

  const fromMap = new Map<string, string[]>()
  const toMap = new Map<string, string[]>()

  // Consider only horizontal processes
  const connections = graph.connections.filter((_) => _.type === 'edge')

  // Build a mapping table of from and to
  for (const conn of connections) {
    if (!fromMap.has(conn.from)) fromMap.set(conn.from, [])
    fromMap.get(conn.from).push(conn.to)

    if (!toMap.has(conn.to)) toMap.set(conn.to, [])
    toMap.get(conn.to).push(conn.from)
  }

  // Downstream DFS
  function dfsDown(nodeKey: string) {
    const children = fromMap.get(nodeKey) || []
    for (const child of children) {
      if (!downstream.has(child)) {
        downstream.add(child)
        dfsDown(child)
      }
    }
  }

  // Upstream DFS
  function dfsUp(nodeKey: string) {
    const parents = toMap.get(nodeKey) || []
    for (const parent of parents) {
      if (!upstream.has(parent)) {
        upstream.add(parent)
        dfsUp(parent)
      }
    }
  }

  dfsDown(startKey)
  dfsUp(startKey)

  return {
    upstream: Array.from(upstream),
    downstream: Array.from(downstream)
  }
}

export function findStartNodes(graph: DeepPartial<TXpertGraph>, key: string): string[] {
  const toMap = new Map<string, string[]>()
  // Consider only horizontal processes
  const connections = graph.connections.filter((_) => _.type === 'edge')
  // Construct toMap: record all upstream nodes of each node
  for (const conn of connections) {
    if (!toMap.has(conn.to)) toMap.set(conn.to, [])
    const [fromKey, type] = conn.from.split('/')
    if (!type || type === 'edge') toMap.get(conn.to).push(fromKey)
  }

  const result = new Set<string>()

  // Recursively search upstream until you reach the starting point
  function dfsUp(nodeKey: string) {
    const parents = toMap.get(nodeKey)

    // There is no upstream, this is the starting point
    if (!parents || parents.length === 0) {
      result.add(nodeKey)
      return
    }

    for (const parent of parents) {
      dfsUp(parent)
    }
  }

  dfsUp(key)

  return Array.from(result)
}

/**
 * A recursive implementation of the Partial<T> type.
 * Source: https://stackoverflow.com/a/49936686/772859
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends (infer U)[]
    ? DeepPartial<U>[]
    : T[P] extends Readonly<infer U>[]
      ? Readonly<DeepPartial<U>>[]
      : DeepPartial<T[P]>
}
