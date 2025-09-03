// import { Octokit } from 'octokit'

/**
 * Check if a branch exists in the remote repository using GitHub API
 * @param repository - The repository (e.g., owner/repo)
 * @param branch - The branch to check
 * @param token - The GitHub Installation Token
 * @returns True if the branch exists, false otherwise
 */
export async function checkRemoteBranch(repository: string, branch: string, token: string): Promise<boolean> {
	// dynamically import Octokit because it's ESM
    const { Octokit } = await import("octokit")

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

/**
 * Create a new issue in a GitHub repository
 * @param owner - The owner of the repository
 * @param repo - The name of the repository
 * @param params - The issue parameters
 * @param token - The GitHub Installation Token
 * @returns The created issue
 */
export async function createIssue(
	owner: string,
	repo: string,
	params: {
		title: string
		body: string
		assignees: string[]
		labels: string[]
	},
	githubAccessToken: string
) {
	// dynamically import Octokit because it's ESM
    const { Octokit } = await import("octokit")
	const { title, body, assignees, labels } = params
	const octokit = new Octokit({ auth: githubAccessToken })
	try {
		const { data: issue } = await octokit.rest.issues.create({
			owner,
			repo,
			title,
			body,
			assignees,
			labels
		})

		return issue
	} catch (error) {
		const errorFields =
			error instanceof Error
				? {
						name: error.name,
						message: error.message,
						stack: error.stack
					}
				: { error }
		console.error(`Failed to create issue`, errorFields)
		throw errorFields
	}
}
