import { Cube, PropertyDimension, PropertyHierarchy } from '@metad/ocap-core'
import { SchemaState } from '@metad/story/designer'

export interface EntitySchemaState<T> extends SchemaState {
  entity: string
  /**
   * ID property of the main model
   */
  id: string
  /**
   * Main modeling properties, such as Dimension, Hierarchy, Level, etc.
   */
  modeling: T
  /**
   * Runtime properties, non-semantic modeling properties
   */
  property: any
}

export interface CubeSchemaState<T> extends EntitySchemaState<T> {
  cube: Cube
  dimension: PropertyDimension
  hierarchy: PropertyHierarchy
  hierarchies: Array<PropertyHierarchy>
}
