import { ISkillRepository, ISkillRepositoryIndex } from "@metad/contracts"


export interface ISkillSourceProvider {
  type: string
  
  meta: {
    /**
     * Provider name, e.g. github / git / zip / marketplace
     */
    name: string
  }

  /**
   * Optional configuration schema for frontend forms
   */
  configSchema?: Record<string, any>

  /**
   * Whether the provider can handle a given source type
   */
  canHandle(sourceType: string): boolean

  /**
   * List skill index entries from a source
   */
  listSkills(config: ISkillRepository): Promise<ISkillRepositoryIndex[]>

  /**
   * Fetch a concrete skill package into a temporary directory
   */
  fetchSkillPackage(
    index: ISkillRepositoryIndex,
  ): Promise<void>
}
