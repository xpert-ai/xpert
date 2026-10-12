/** Durable application state inside an authorized Assistant workspace.
 * Paths and lock keys are canonical relative paths: no empty, dot or .locks segments.
 * Handles stay bound to their first authorized volume; recreate them after a workspace policy change. */
export interface WorkspaceStorage {
  read(path: string): Promise<Buffer>
  write(path: string, content: string | Uint8Array): Promise<void>
  mkdir(path: string): Promise<void>
  list(path: string): Promise<string[]>
  remove(path: string): Promise<void>
  /** Shared-filesystem mutex renewed by confirmed heartbeats. Lock loss rejects subsequent
   * app-data and ordinary Volume mutations in the callback, including detached work. */
  withLock<T>(key: string, action: () => Promise<T>, options?: { waitMs?: number }): Promise<T>
}

/** Host resolves the namespace from this loaded plugin's metadata, never from a filesystem path.
 * Native plugins are trusted server code; this handle is not a sandbox for malicious plugin code. */
export interface WorkspaceAppDataOptions {
  pluginName: string
  /** Opt in for personal data; shared Assistant workspaces otherwise remain supported. */
  requireUserIsolation?: boolean
}
