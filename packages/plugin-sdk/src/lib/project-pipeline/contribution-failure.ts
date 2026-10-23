/**
 * Plugin metadata may be parsed in a provider constructor, before registry discovery.
 * Preserve Nest injection metadata while isolating validation failures from external plugins.
 * Failed contributions never become executable templates; built-in and non-validation errors still throw.
 */
import { z } from 'zod/v3'
import { PLUGIN_METADATA_KEY } from '../types'

export type PipelineContributionIssue = { path: (string | number)[]; code: string }

export class UnavailablePipelineContribution {
  constructor(
    readonly metatype: Function,
    readonly issues: PipelineContributionIssue[]
  ) {}
}

export function pipelineContributionIssues(error: z.ZodError): PipelineContributionIssue[] {
  // Do not log schema messages or input values, which may contain plugin configuration secrets.
  return error.issues.slice(0, 20).map(({ path, code }) => ({ path, code }))
}

export function isolatePipelineContribution<T extends Function>(target: T): T {
  function IsolatedContribution(...args: unknown[]) {
    try {
      return Reflect.construct(target, args, new.target)
    } catch (error) {
      if (!Reflect.getMetadata(PLUGIN_METADATA_KEY, new.target) || !(error instanceof z.ZodError)) throw error
      return new UnavailablePipelineContribution(new.target, pipelineContributionIssues(error))
    }
  }
  Object.setPrototypeOf(IsolatedContribution, target)
  IsolatedContribution.prototype = Object.create(target.prototype, {
    constructor: { value: IsolatedContribution, writable: true, configurable: true }
  })
  Object.defineProperty(IsolatedContribution, 'name', { value: target.name })
  // A class decorator must preserve the caller's constructor type; Reflect.construct preserves its arguments.
  return IsolatedContribution as unknown as T
}
