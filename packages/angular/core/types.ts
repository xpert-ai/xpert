import { InjectionToken } from '@angular/core'
import { Agent, DataSourceOptions } from '@xpert-ai/ocap-core'

export const OCAP_AGENT_TOKEN = new InjectionToken<Agent>('OCAP-Agent')
export const OCAP_MODEL_TOKEN = new InjectionToken<DataSourceOptions>('OCAP-Model')
export const OCAP_DATASOURCE_TOKEN = new InjectionToken<DataSourceOptions>('OCAP-DataSource')

export enum EntityCapacity {
  Dimension = 'Dimension',
  Hierarchy = 'Hierarchy',
  Measure = 'Measure',
  Indicator = 'Indicator',
  Calculation = 'Calculation',
  Parameter = 'Parameter'
}
