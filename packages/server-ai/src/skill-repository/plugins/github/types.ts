export interface IGitHubSkillRepositoryOptions {
    /**
     * GitHub repository URL
     */
    url: string
	/**
	 * Path within the repository where the skills are located
	 * Defaults to repository root when omitted.
	 */
	path?: string
    /**
     * Branch name to use
     */
    branch?: string
}

export interface IGitHubSkillRepositoryCredentials {
    /**
     * GitHub personal access token
     */
    token?: string
}
