# draft

This library was generated with [Nx](https://nx.dev).

## Building

Run `nx build draft` to build the library.

## Running unit tests

Run `nx test draft` to execute the unit tests via [Jest](https://jestjs.io).

## Customer intent Assistant

The `customer-intent` module contributes two Assistant templates, the `customer-service-intent` workflow node and the `assistant.customer_service_intent` evolution target. The module uses the organization's reviewed policy to route requests to the ordinary Assistant's primary model. Its templates are in `src/lib/customer-intent/templates`.

Run `corepack pnpm nx test draft` from the repository root. To verify a published Assistant against its local Canary release, use `node packages/plugins/draft/tools/verify-intent-assistant.mjs --api-url "$XPERT_API_URL" --org-id "$XPERT_ORG_ID" --assistant-id "$XPERT_ASSISTANT_ID" --release-id "$XPERT_RELEASE_ID"`.
