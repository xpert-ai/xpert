import type { WorkbenchEntry } from './workbench-entry.schema'

/** An authorized Assistant destination for a Project's Workbench. This descriptor grants no access. */
export interface ProjectWorkbenchEntry extends WorkbenchEntry {
  projectId: string
}
