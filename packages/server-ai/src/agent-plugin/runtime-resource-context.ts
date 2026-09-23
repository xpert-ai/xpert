/** Server-only capability context. A JSON Assistant graph cannot forge this symbol. */
export const RUNTIME_RESOURCE_SKILLS = Symbol('xpert.runtimeResourceSkills')
/** Resolved, authorized plugin resource passed to middleware without serializing host paths into messages. */
export interface RuntimeResourceSkillSource {
    id: string
    name: string
    description: string
    rootPath: string
    runtimePath: string
    version: string
    /** Owning agent-plugin package identity, distinct from the contributed skill's ID. */
    origin?: { type: 'plugin'; id: string }
}
export interface RuntimeResourceMiddlewareContext {
    [RUNTIME_RESOURCE_SKILLS]?: RuntimeResourceSkillSource[]
}
