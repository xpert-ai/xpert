/**
 * Returns whether reduced-isolation Sandbox Runtime Bindings may be used.
 *
 * Only explicit development and test modes qualify. An unset or custom
 * NODE_ENV remains fail-closed so a production deployment cannot accidentally
 * execute a local Runtime Provider.
 */
export function isDevelopmentSandboxRuntimeEnvironment(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment['NODE_ENV'] === 'development' || environment['NODE_ENV'] === 'test'
}
