import { PropertyHierarchy } from "@metad/ocap-core"

export type TCubeNode<T = any> = {
  key: string
  type?: 'shared-dimension' | 'inline-dimension' | 'cube'
  data?: T
  position?: { x: number; y: number }
  size?: { width: number; height: number }
}

export type TCubeConnection = {
  key: string
  source: string
  target: string
  type?: 'cube-dimension' | 'cube-dimension-usage' | 'cube-measure'
}

export type THierarchyNode = {
  dimension: string
  hierarchy: PropertyHierarchy
}