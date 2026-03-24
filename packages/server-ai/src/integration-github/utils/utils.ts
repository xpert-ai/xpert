import { getInstallationToken, GitHubToken } from "./auth";
import { IIntegration } from "@metad/contracts";

export async function getGitHubInstallationTokenOrThrow(
  integration: IIntegration,
  installationId: string,
): Promise<GitHubToken> {
  const appId = integration.options.appId;
  const privateAppKey = integration.options.privateKey;

  if (!appId || !privateAppKey) {
    throw new Error("GitHub App ID or Private App Key is not configured.");
  }

  const tokenData = await getInstallationToken(
    installationId,
    appId,
    privateAppKey,
  )

  return tokenData
}