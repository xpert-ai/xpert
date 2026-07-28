import { ISemanticModel } from './semantic-model'

export interface AgentEventRequest {
  url?: string
  headers: {
    [key: string]: string[]
  }
  body?: any
  catalog?: string
  table?: string
  forceRefresh?: boolean
  auth?: {
    username: string
    password: string
  }
}
export interface AgentEventResponse extends AgentEventRequest {
  status: number
  statusText: string
}

export enum AgentEventType {
  request = 'request',
  response = 'response',
  error = 'error'
}

export interface AgentEvent {
  type?: 'connected'
  id: string
  event: AgentEventType
  data: {
    organizationId?: string
    dataSource?: {
      id: string
      name: string
      type: string
      updatedAt?: Date
    }
    modelId?: string
    semanticModel?: ISemanticModel
    request: AgentEventRequest
    response?: AgentEventResponse
    error?: string
  }
}
