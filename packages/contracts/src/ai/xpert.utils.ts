import { IPoint } from '../types'
import { IXpertAgent } from './xpert-agent.model'
import { IXpert, TXpertTeamNode } from './xpert.model'

// Helpers
export function omitXpertRelations(xpert: Partial<IXpert>) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { draft, agent, agents, executors, leaders, knowledgebases, knowledgebase, environment, integrations, toolsets, managers, ...rest } = xpert ?? {}
  return rest
}

export function figureOutXpert(xpert: IXpert, isDraft: boolean) {
  return (isDraft ? xpert.draft?.team : xpert) ?? xpert
}

export function xpertLabel(agent: Partial<IXpert>) {
  return agent.title || agent.name
}

export function createXpertGraph(xpert: IXpert, position: IPoint) {
  const graph = xpert.graph ?? xpert.draft

  const { nodes, size } = locateNodes(graph.nodes, position)

  return { nodes, size, connections: graph.connections }
}

export function locateNodes(nodes: TXpertTeamNode[], position: IPoint) {
  // Extract the area by positions of all nodes
  const positions = nodes.map((node) => node.position)
  const x0Positions = positions.map((pos) => pos.x)
  const x1Positions = nodes.map((node) => node.position.x + (node.size?.width ?? 240)) // Node width min 240
  const y0Positions = positions.map((pos) => pos.y)
  const y1Positions = nodes.map((node) => node.position.y + (node.size?.height ?? 70)) // Node height min 70

  const xRange = {
    min: Math.min(...x0Positions),
    max: Math.max(...x1Positions)
  }

  const yRange = {
    min: Math.min(...y0Positions),
    max: Math.max(...y1Positions)
  }

  const size = {
    width: xRange.max - xRange.min + 50,
    height: yRange.max - yRange.min + 80
  }

  nodes.forEach((node) => {
    node.position = {
      x: position.x + (node.position?.x ? node.position.x - xRange.min : 0) + 10,
      y: position.y + (node.position?.y ? node.position.y - yRange.min : 0) + 40
    }
  })

  return { size, nodes }
}

/**
 * Create all nodes of xpert and it's area size
 *
 * @param xpert
 * @returns
 */
export function createXpertNodes(xpert: IXpert, position: IPoint) {
  const nodes: TXpertTeamNode[] = []
  const agents = []
  if (!xpert.agent.options?.hidden) {
    agents.push(xpert.agent)
  }
  if (xpert.agents?.length) {
    agents.push(...xpert.agents)
  }
  // Agents
  nodes.push(
    ...agents.map((_) => {
      return {
        type: 'agent',
        key: _.key,
        position: xpert.options?.agent?.[_.key]?.position ?? { x: 0, y: 0 },
        size: xpert.options?.agent?.[_.key]?.size,
        entity: _
      } as TXpertTeamNode
    })
  )

  // External experts
  xpert.executors?.forEach((executor) => {
    const position = xpert.options?.xpert?.[executor.id]?.position ?? { x: 0, y: 0 }
    const executorGraph = createXpertNodes(executor, position)
    nodes.push({
      type: 'xpert',
      key: executor.id,
      position,
      size: executorGraph.size,
      entity: executor,
      nodes: executorGraph.nodes
    } as TXpertTeamNode)
  })

  // knowledgebases
  nodes.push(
    ...(xpert.knowledgebases ?? []).map((x) => {
      return {
        key: x.id,
        type: 'knowledge',
        position: xpert.options?.knowledge?.[x.id]?.position ?? { x: 0, y: 0 },
        size: xpert.options?.knowledge?.[x.id]?.size,
        entity: x
      } as TXpertTeamNode
    })
  )

  // Toolsets
  nodes.push(
    ...(xpert.toolsets ?? []).map((x) => {
      return {
        key: x.id,
        type: 'toolset',
        position: xpert.options?.toolset?.[x.id]?.position ?? { x: 0, y: 0 },
        size: xpert.options?.toolset?.[x.id]?.size,
        entity: x
      } as TXpertTeamNode
    })
  )

  // Extract the area by positions of all nodes
  const positions = nodes.map((node) => node.position)
  const x0Positions = positions.map((pos) => pos.x)
  const x1Positions = nodes.map((node) => node.position.x + (node.size?.width ?? 240)) // Node width min 240
  const y0Positions = positions.map((pos) => pos.y)
  const y1Positions = nodes.map((node) => node.position.y + (node.size?.height ?? 70)) // Node height min 70

  const xRange = {
    min: Math.min(...x0Positions),
    max: Math.max(...x1Positions)
  }

  const yRange = {
    min: Math.min(...y0Positions),
    max: Math.max(...y1Positions)
  }

  const size = {
    width: xRange.max - xRange.min + 50,
    height: yRange.max - yRange.min + 80
  }

  nodes.forEach((node) => {
    node.position = {
      x: position.x + (node.position?.x ? node.position.x - xRange.min : 0) + 10,
      y: position.y + (node.position?.y ? node.position.y - yRange.min : 0) + 40
    }
  })

  return { nodes, size }
}

export function createAgentConnections(agent: IXpertAgent, collaborators: IXpert[]) {
  const connections = []
  const from = agent.leaderKey
  const to = agent.key
  if (from && to) {
    connections.push({
      type: 'agent',
      key: from + '/' + to,
      from,
      to
    })
  }

  // collaborators
  agent.collaboratorNames?.forEach((name) => {
    const collaborator = collaborators.find((_) => _.name === name)
    if (collaborator) {
      const from = agent.key
      const to = collaborator.id
      connections.push({
        type: 'xpert',
        key: from + '/' + to,
        from,
        to
      })
    }
  })

  // knowledgebases
  agent.knowledgebaseIds?.forEach((knowledgebaseId) => {
    const from = agent.key
    const to = knowledgebaseId
    connections.push({
      type: 'knowledge',
      key: from + '/' + to,
      from,
      to
    })
  })

  // toolsets
  agent.toolsetIds?.forEach((toolsetId) => {
    const from = agent.key
    const to = toolsetId
    connections.push({
      type: 'toolset',
      key: from + '/' + to,
      from,
      to
    })
  })

  return connections
}
