import { AsyncLocalStorageProviderSingleton } from "@langchain/core/singletons";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { CONFIG_KEY_CREDENTIALS } from "../agent/constants";

/**
 * A helper utility function that returns the credentials for the currently executing task
 *
 * @returns the credentials for the currently executing task
 */
export function getCurrentTaskCredentials<T = unknown>(
  config?: LangGraphRunnableConfig
): T {
  const runConfig: LangGraphRunnableConfig =
    config ?? AsyncLocalStorageProviderSingleton.getRunnableConfig();

  if (runConfig === undefined) {
    throw new Error(
      [
        "Config not retrievable. This is likely because you are running in an environment without support for AsyncLocalStorage.",
        "If you're running `getCurrentTaskCredentials` in such environment, pass the `config` from the node function directly.",
      ].join("\n")
    );
  }

  if (
    runConfig.configurable?.[CONFIG_KEY_CREDENTIALS] ===
    undefined
  ) {
    throw new Error("BUG: internal credentials not initialized.");
  }

  return runConfig!.configurable![CONFIG_KEY_CREDENTIALS] as T;
}
