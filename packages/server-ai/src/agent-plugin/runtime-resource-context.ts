/** Server-only capability context. A JSON Assistant graph cannot forge this symbol. */
export const RUNTIME_RESOURCE_SKILLS = Symbol('xpert.runtimeResourceSkills')
export interface RuntimeResourceSkillSource {
    id: string
    name: string
    description: string
    rootPath: string
    runtimePath: string
    version: string
}
export interface RuntimeResourceMiddlewareContext {
    [RUNTIME_RESOURCE_SKILLS]?: RuntimeResourceSkillSource[]
}
