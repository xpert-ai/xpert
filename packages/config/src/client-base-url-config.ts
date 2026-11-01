export function readClientBaseUrl(env: NodeJS.ProcessEnv): string {
  return env.CLIENT_BASE_URL || 'http://localhost:4200'
}
