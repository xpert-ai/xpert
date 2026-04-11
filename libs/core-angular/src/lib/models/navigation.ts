import { SemanticObjectMappingType } from '@xpert-ai/ocap-core'

export interface IntentNavigation {
  /**
   * Name of the Semantic Object
   */
  semanticObject: string

  /**
   * Name of the Action on the Semantic Object. If not specified, let user choose which of the available actions to trigger.
   */
  action: string

  /**
   * Maps properties of the annotated entity type to properties of the Semantic Object
   */
  mapping: SemanticObjectMappingType[]
}

export interface Intent {
  /**
   * Name of the Semantic Object
   */
  semanticObject: string

  /**
   * Name of the Action on the Semantic Object. If not specified, let user choose which of the available actions to trigger.
   */
  action: string

  /**
   * Parameters of Semantic Object
   */
  parameters: {
    [key: string]: any
  }
}
