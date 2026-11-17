import { contentSnapshotSchema } from './catalog.schema'

/** Validate persisted suppression metadata without loading private source content. */
export const contentCoverageSchema = contentSnapshotSchema.innerType().pick({ source: true, containedPaths: true })
