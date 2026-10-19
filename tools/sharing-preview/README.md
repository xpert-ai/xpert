# Assistant sharing preview

From the repository root:

```sh
node tools/sharing-preview/build.mjs
python3 -m http.server 4319 --bind 127.0.0.1 --directory .cache/sharing-preview
```

Open http://127.0.0.1:4319/. The preview compiles the production sharing component, its template, the existing user avatar and Zard components with the Cloud theme. Only injected APIs, organization state and the surrounding navigation are fixtures. It performs no real sharing or authenticated requests. Controls switch between personal sharing, group permissions, read-only access and dark mode.

Generated files and local browser captures live in `.cache/sharing-preview`. Rebuild after changing the component.

Authorization tests are under `packages/server-ai/src/xpert/sharing`. The PostgreSQL suite requires `XPERT_SHARING_TEST_DATABASE_URL` pointing to a disposable PostgreSQL database; publication tests use `XPERT_PUBLICATION_TEST_DATABASE_URL`. Each suite creates and drops its own random schema. HTTP tests exercise the actual Nest validation pipes; the Angular tests render the real Zard template and exercise capability boundaries and mutation failures.
