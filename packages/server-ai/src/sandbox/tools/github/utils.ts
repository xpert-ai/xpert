import { RestEndpointMethodTypes } from '@octokit/plugin-rest-endpoint-methods';
import axios from 'axios';
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
	const { Octokit } = await import('octokit')

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
	const { Octokit } = await import('octokit')
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

export async function getUserRepositories(pat: string) {
  const repositories = [];
  let page = 1;
  const perPage = 100; // 每页最大 100 个仓库

  try {
    while (true) {
      const response = await axios.get<RestEndpointMethodTypes["repos"]["listForAuthenticatedUser"]["response"]['data']>('https://api.github.com/user/repos', {
        headers: {
          Authorization: `token ${pat}`,
          Accept: 'application/vnd.github.v3+json',
        },
        params: {
          per_page: perPage,
          page: page,
          sort: 'updated', // 按更新时间排序
          direction: 'desc', // 降序
        },
      });

      const repos = response.data;
      if (repos.length === 0) break; // 没有更多仓库，退出循环

	  console.log(repos);

      repositories.push(...repos.map(repo => ({
        full_name: repo.full_name,
        name: repo.name,
        private: repo.private,
        permissions: repo.permissions,
        url: repo.html_url,
		description: repo.description,
      })));

      page++; // 下一页
    }

    return repositories;
  } catch (error) {
    if (error.response) {
      if (error.response.status === 401) {
        console.error('Error: Invalid or expired PAT. Please check your token.');
      } else if (error.response.status === 403) {
        console.error('Error: Insufficient permissions or rate limit exceeded.');
      } else {
        console.error(`Error: ${error.response.status} - ${error.response.data.message}`);
      }
    } else {
      console.error('Error fetching repositories:', error.message);
    }
    throw error;
  }
}