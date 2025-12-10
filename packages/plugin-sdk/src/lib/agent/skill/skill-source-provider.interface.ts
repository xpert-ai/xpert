import { ISkillRepository, ISkillRepositoryIndex, TSkillSourceMeta } from "@metad/contracts"

export interface ISkillSourceProvider {
  type: string
  
  meta: TSkillSourceMeta

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
  installSkillPackage(
    index: ISkillRepositoryIndex,
    installDir: string
  ): Promise<string>

  /**
   * Uninstall a skill package from a given path.
   * 
   * @param path 
   */
  uninstallSkillPackage(path: string): Promise<void>
}
