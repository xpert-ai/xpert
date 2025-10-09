export class PluginLoadError extends Error {
  constructor(public plugin: string, message: string, public cause?: unknown) { super(`[${plugin}] ${message}`); }
}

export class PluginConfigError extends Error {
  constructor(public plugin: string, message: string) { super(`[${plugin}] ${message}`); }
}

export class StrategyNotFoundError extends Error {
  constructor(public key: string) { super(`Strategy not found for key: ${key}`); }
}