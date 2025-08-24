import { Octokit } from "octokit"

/**
 * Check if a branch exists in the remote repository using GitHub API
 * @param repository - The repository (e.g., owner/repo)
 * @param branch - The branch to check
 * @param token - The GitHub Installation Token
 * @returns True if the branch exists, false otherwise
 */
export async function checkRemoteBranch(repository: string, branch: string, token: string): Promise<boolean> {
	try {
		const [owner, repo] = repository.split('/')
		const octokit = new Octokit({ auth: token })
		await octokit.rest.repos.getBranch({ owner, repo, branch })
		return true
	} catch (error) {
		if (error.status === 404) {
			return false
		}
		throw error
	}
}
