# How to publish npm packages

Release new version of npm packages:

```bash
npx nx release patch
```

First, build the packages:

```bash
npx nx build plugin-sdk
```

Then publish the packages:

```bash
npx nx run plugin-sdk:nx-release-publish --access public --otp=<one-time-password-if-needed>
```
