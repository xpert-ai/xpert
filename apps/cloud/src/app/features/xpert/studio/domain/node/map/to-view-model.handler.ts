import { IPoint, ISize } from '@foblex/2d';
import { IHandler } from '@foblex/mediator'
import { createXpertNodes, IXpert, TXpertTeamNode } from 'apps/cloud/src/app/@core'

export class ToNodeViewModelHandler implements IHandler<void, {nodes: TXpertTeamNode[]; size: ISize}> {
  constructor(private team: IXpert, private options?: {position: IPoint}) {}

  public handle() {
    return createXpertNodes(this.team, this.options?.position ?? {x: 0, y: 0})
  }
}

// /**
//  * Create agents nodes of xpert and it's area size
//  * 
//  * @param xpert 
//  * @returns 
//  */
// function createXpertNodes(xpert: IXpert, position: IPoint) {
//   const nodes: TXpertTeamNode[] = []
//   nodes.push(...[xpert.agent, ...(xpert.agents ?? [])].map((_) => {
//     return {
//       type: 'agent',
//       key: _.key,
//       position: xpert.options?.agent?.[_.key]?.position ?? {x: 0, y: 0},
//       size: xpert.options?.agent?.[_.key]?.size,
//       entity: _
//     } as TXpertTeamNode
//   }))

//   xpert.executors?.forEach((executor) => {
//     const position = xpert.options?.xpert?.[executor.id]?.position ?? {x: 0, y: 0}
//     const executorGraph = createXpertNodes(executor, position)
//     nodes.push({
//       type: 'xpert',
//       key: executor.id,
//       position,
//       size: executorGraph.size,
//       entity: executor,
//       nodes: executorGraph.nodes
//     } as TXpertTeamNode)
//   })

//   // knowledgebases
//   nodes.push(...(xpert.knowledgebases ?? []).map((x) => {
//     return {
//       key: x.id,
//       type: 'knowledge',
//       position: xpert.options?.knowledge?.[x.id]?.position ?? {x: 0, y: 0},
//       size: xpert.options?.knowledge?.[x.id]?.size,
//       entity: x,
//     } as TXpertTeamNode
//   }))

//   // Toolsets
//   nodes.push(...(xpert.toolsets ?? []).map((x) => {
//     return {
//       key: x.id,
//       type: 'toolset',
//       position: xpert.options?.toolset?.[x.id]?.position ?? {x: 0, y: 0},
//       size: xpert.options?.toolset?.[x.id]?.size,
//       entity: x,
//     } as TXpertTeamNode
//   }))


//   // Extract the area by positions of all nodes
//   const positions = nodes.map((node) => node.position)
//   const x0Positions = positions.map((pos) => pos.x)
//   const x1Positions = nodes.map((node) => node.position.x + (node.size?.width ?? 240)) // Node width min 240
//   const y0Positions = positions.map((pos) => pos.y)
//   const y1Positions = nodes.map((node) => node.position.y + (node.size?.height ?? 70)) // Node height min 70

//   const xRange = {
//     min: Math.min(...x0Positions),
//     max: Math.max(...x1Positions)
//   }

//   const yRange = {
//     min: Math.min(...y0Positions),
//     max: Math.max(...y1Positions)
//   }

//   const size = {
//     width: xRange.max - xRange.min + 20, 
//     height: yRange.max - yRange.min + 20
//   }

//   nodes.forEach((node) => {
//     node.position = {
//       x: position.x + (node.position?.x ? node.position.x - xRange.min : 0) + 10,
//       y: position.y + (node.position?.y ? node.position.y - yRange.min : 0) + 10,
//     }
//   })

//   return { nodes, size }
// }

// function updateTeamPosition(nodes: TXpertTeamNode[], position)