import { isRouterKey } from '../ai'
import { TXpertGraph } from '../ai/xpert.model'
import { DeepPartial } from '../types'

/**
 * Channels of all upstream and downstream nodes relative to the starting point startKey.
 *
 * @param graph
 * @param startKey
 */
export function allChannels(graph: TXpertGraph, startKey: string) {
  graph = getCurrentGraph(graph, startKey)
  return graph.nodes.filter((node) => !(node.type === 'workflow' && isRouterKey(node.key))).map((node) => node.key)
}

export function findStartNodes(graph: DeepPartial<TXpertGraph>, key: string): string[] {
  const toMap = new Map<string, string[]>()
  // Consider only horizontal processes
  const connections = graph.connections.filter((_) => _.type === 'edge')
  // Construct toMap: record all upstream nodes of each node
  for (const conn of connections) {
    if (!toMap.has(conn.to)) toMap.set(conn.to, [])
    const [fromKey] = conn.from.split('/')
    if (conn.type === 'edge') {
      toMap.get(conn.to).push(fromKey)
    }
  }

  const result = new Set<string>()

  const checked = []
  // Recursively search upstream until you reach the starting point
  function dfsUp(nodeKey: string) {
    checked.push(nodeKey)
    const parents = toMap.get(nodeKey)

    // There is no upstream, this is the starting point
    if (!parents || parents.length === 0) {
      result.add(nodeKey)
      return
    }

    for (const parent of parents) {
      // There is a cycle
      if (checked.includes(parent)) {
        return
      }
      dfsUp(parent)
    }
  }

  dfsUp(key)

  return Array.from(result)
}

/**
 * Keep the content in the same graph as the key node (including the node, its connected nodes, and the 'edge' type connections between them)
 * 
 * @param graph 
 * @param key 
 * @returns 
 */
export function getCurrentGraph(graph: TXpertGraph, key: string): TXpertGraph {
  const validConnections = graph.connections.filter(conn => conn.type === 'edge')

  // Extract the primary key (remove the / suffix)
  const normalize = (k: string) => k.split('/')[0]

  // Adjacency list: bidirectional (because you want to traverse the current graph)
  const adjacency = new Map<string, Set<string>>()

  for (const conn of validConnections) {
    const from = normalize(conn.from)
    const to = normalize(conn.to)

    if (!adjacency.has(from)) adjacency.set(from, new Set())
    if (!adjacency.has(to)) adjacency.set(to, new Set())

    adjacency.get(from).add(to)
    adjacency.get(to).add(from)
  }

  const visited = new Set<string>()
  const queue: string[] = key ? [normalize(key)] : []

  // BFS/DFS collects all nodes in the same graph
  while (queue.length > 0) {
    const current = queue.pop()
    if (visited.has(current)) continue
    visited.add(current)

    const neighbors = adjacency.get(current) || new Set()
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor)
      }
    }
  }

  const nodeSet = new Set(graph.nodes.map(n => n.key))
  const keptNodes = graph.nodes.filter(n => visited.has(normalize(n.key)))
  const keptNodeKeys = new Set(keptNodes.map(n => n.key))

  const keptConnections = validConnections.filter(conn => {
    const from = normalize(conn.from)
    const to = normalize(conn.to)
    return visited.has(from) && visited.has(to)
  })

  return {
    nodes: keptNodes,
    connections: keptConnections
  }
}

export function shortTitle(input: string) {
  if (input) {
    return input.length <= 50 ? input : input.slice(0, 50) + '...'
  }
  return null
}