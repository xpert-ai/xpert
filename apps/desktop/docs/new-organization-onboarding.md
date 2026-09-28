# New organization onboarding in Bosi

A new organization has its own workspaces, plugin packages, model permissions and application installations. Seeing a tenant-shared expert does not grant access to its underlying model.

## Before starting

1. Create the organization in Xpert. Open Bosi's organization selector to refresh the organizations available to the signed-in user. Tenant administrators see the organizations they can manage; other users see their memberships.
2. Select the new organization and verify that an editable workspace is available.
3. Configure an organization primary language model with a default LLM, or grant access to a tenant primary model. Check both provider configuration and membership/model access policy. A configured model that is not authorized is not an available model; a secondary model alone cannot satisfy template installation.
4. Local Bash and plugin tasks require tool calling. Application setup may additionally require embedding or vision models.

## Scenario checklist

| Scenario               | Setup in Bosi                                                                                                                                                                                                  | Verify                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Local Bash             | Install Bosi Desktop Assistant. Enable Desktop Shell in settings, choose a test working directory, and grant the current conversation access with Use this computer.                                           | Ask for the OS, current directory and a small file written inside the test directory. Verify the local file and exit code. A cloud sandbox result does not count as local execution. |
| Other plugins          | An organization administrator imports a portable plugin in Xpert plugin management. In Bosi's Plugins tab, select the expert's workspace and add the plugin. Select it again in the conversation Plugins menu. | Execute a small plugin task and inspect its real output. Workspace availability, conversation selection and external-service authorization are separate steps.                       |
| Application Assistants | Discover & add → Apps → open app details → complete the model preflight → Install & use.                                                                                                                       | Check the initialized assistants and views, complete a task, then reopen the app to confirm it is reused rather than installed twice.                                                |
| Request an expert      | Use an ordinary member account and a discoverable expert that the member cannot already run. Open its request form and provide a reason.                                                                       | Verify Requested, have a different authorized reviewer approve, refresh Bosi and open the expert. Tenant-shared experts that are already usable do not exercise the request flow.    |

## Document generation and delivery

The sandbox image must include the Documents runtime, LibreOffice and Chinese fonts such as Noto Sans CJK SC. Run the plugin doctor before a rendering task. If dependencies are unavailable, stop and report the missing runtime; do not install packages or retry external downloads during acceptance.

Generate a small document, inspect its actual text, render every page and review the resulting images before delivery. Click the delivery card in Bosi to preview its saved version and download it. Bosi verifies the file size and checksum before previewing; DOCX uses the same rendering library as Cloud. Unsupported formats remain downloadable. Generating a file alone does not prove that Chinese fonts, pagination or the delivery interaction work.

## Handling blocked setup

- An empty plugin library means no packages have been imported into this organization. Adding a package to a workspace is a subsequent step.
- Template installation stops before creating an assistant if no authorized primary default language model is available. After configuration, use Refresh settings.
- If a shared expert reports that the current membership plan cannot use its model, resolve the model entitlement. Repeating installation or adding workspace membership does not resolve that condition.
- Copy provider credentials between organizations only with explicit authorization, through scoped platform APIs, without logging or persisting secrets locally. Check that the destination has the matching model-provider plugin; copying credentials does not copy organization-scoped model definitions.
- Do not modify existing expert visibility or bypass organization membership to make a test pass.

The built-in template files are bootstrapped into the configured template directory on first use. Existing installations receive the new Bosi catalog entries through a one-time, ID-based upgrade when the server starts. Existing descriptors, exported/custom templates, categories and YAML overrides are preserved. Later deliberate removals are preserved as well; restart the server and refresh the catalog to see the newly introduced template.
