import { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'
import { ScheduleTaskStatus, TScheduleOptions } from '../schedule';

export type SemanticModelEntityOptions = {
  vector: {
    dimensions: string[];
    // /**
    //  * @deprecated use dimensions
    //  */
    // hierarchies?: string[];
  };
  members?: Record<string, number>;
}

export enum ModelEntityType {
  Cube = 'cube',
  Dimension = 'dimension'
}

/**
 * Job info
 */
export type SemanticModelEntityJob = {
  id: string | number
  status?: 'completed' | 'failed' | 'processing' | 'cancel'
  progress?: number
  error?: string
  createdAt?: Date
  endAt?: Date
}

export interface ISemanticModelEntity extends IBasePerTenantAndOrganizationEntityModel {
  name?: string
  caption?: string
  type?: ModelEntityType
  /**
   * Schedule sync job into queue
   */
  schedule?: TScheduleOptions
  timeZone?: string
  status?: ScheduleTaskStatus

  modelId?: string

  // Storing semantic metadata
  options?: SemanticModelEntityOptions

  job?: SemanticModelEntityJob
}
