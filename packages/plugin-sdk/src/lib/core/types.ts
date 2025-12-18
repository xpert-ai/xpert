/**
 * Who provided this strategy instance:
 * - "core": main app providers
 * - "plugin": runtime loaded plugin providers
 */
export type StrategySourceKind = 'core' | 'plugin'

export interface StrategyEntry<S> {
  instance: S
  /**
   * Unique id for conflict detection & removal.
   * For core providers you can use wrapper.id or class name.
   * For plugin providers use `${org}:${pluginId}@${version}:${className}`
   */
  sourceId: string

  sourceKind: StrategySourceKind
}
