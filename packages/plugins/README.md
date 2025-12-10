# Plugins

How to generate a new plugin library, replace `my-plugin` with your plugin name and import path:

```bash
npx nx g @nx/js:lib packages/plugins/my-plugin --importPath=@xpert-ai/plugin-my-plugin --unitTestRunner=jest --publishable --bundler=rollup --linter=eslint
```

- Add the corresponding build command `yarn nx build my-plugin` to `build:plugins` in *package.json*.
- Add the corresponding build command `yarn nx build my-plugin` to `build:plugins` in *./.deploy/api/package.json*.

- Add external dependencies in plugin's *project.json*:

```json
"external": [
    "@nestjs/common",
    "@nestjs/core",
    "@nestjs/microservices",
    "kafkajs",
    "amqplib",
    "mqtt",
    "nats"
]
```

- Add *index.cjs* for plugin for local run.
