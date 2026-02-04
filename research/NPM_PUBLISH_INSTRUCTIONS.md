# Mini-LLM NPM Publishing Guide

This document provides step-by-step instructions for publishing the Mini-LLM SDK packages to NPM.

## Package Overview

We have two packages to publish:

1. **mini-llm** (gateway) - The core HTTP gateway for routing LLM requests
2. **mini-llm-sdk** - The SDK for managing gateway processes programmatically

## Prerequisites

- Node.js 18+ installed
- NPM account with publishing rights
- Access to the `mini-llm` package name on NPM

## Step 1: Login to NPM

```bash
npm login
```

Enter your NPM credentials when prompted.

## Step 2: Build All Packages

From the root directory:

```bash
# Install dependencies
npm install

# Build gateway package
cd packages/gateway && npm run build

# Build SDK package
cd ../sdk && npm run build
```

## Step 3: Publish the Gateway Package

The gateway package (`mini-llm`) must be published first since the SDK depends on it.

```bash
cd packages/gateway

# Dry run to check what will be published
npm publish --dry-run

# Publish (for first time)
npm publish --access public

# Or publish a new version
npm version patch  # or minor, major
npm publish
```

## Step 4: Publish the SDK Package

```bash
cd packages/sdk

# Dry run to check what will be published
npm publish --dry-run

# Publish (for first time)
npm publish --access public

# Or publish a new version
npm version patch  # or minor, major
npm publish
```

## What Gets Published

### mini-llm (gateway) package includes:
- `dist/` - Compiled JavaScript and type definitions
- `.env.example` - Example environment configuration
- `package.json` - Package metadata

### mini-llm-sdk package includes:
- `dist/` - Compiled JavaScript and type definitions
- `package.json` - Package metadata

## Versioning Strategy

We use semantic versioning:
- **patch** (0.0.x) - Bug fixes
- **minor** (0.x.0) - New features, backward compatible
- **major** (x.0.0) - Breaking changes

Keep both packages at the same version for consistency.

## Post-Publish Verification

After publishing, verify the packages work:

```bash
# Create a test directory
mkdir test-mini-llm && cd test-mini-llm
npm init -y

# Install packages
npm install mini-llm mini-llm-sdk

# Test the gateway CLI
npx mini-llm

# Test programmatic usage
cat > test.js << 'EOF'
import { createMiniLLM } from 'mini-llm-sdk';

const miniLLM = createMiniLLM();
await miniLLM.ready();
console.log('Gateway running at:', miniLLM.url);
await miniLLM.stop();
EOF

node test.js
```

## Troubleshooting

### "Package name already exists"
- Check if you have publishing rights
- Contact the package owner if needed

### "Cannot find module"
- Ensure `main` and `types` in package.json point to correct paths
- Verify the `dist/` folder exists before publishing

### "EACCES: permission denied"
- Run `npm login` again
- Check your NPM account permissions

## Important Notes

1. **Never commit API keys** - The `.env` file with real keys should never be committed
2. **Clean build before publish** - Always run `npm run clean && npm run build` before publishing
3. **Test locally first** - Use `npm link` to test packages locally before publishing
4. **Update CHANGELOG** - Document changes for each version

## NPM Package Links

Once published, the packages will be available at:
- https://www.npmjs.com/package/mini-llm
- https://www.npmjs.com/package/mini-llm-sdk

## Using in Passy.ai

After publishing, update Passy.ai's dependencies:

```bash
npm install mini-llm mini-llm-sdk
```

Then import and use:

```typescript
import { createMiniLLM } from 'mini-llm-sdk';

const miniLLM = createMiniLLM({
  port: 3333,
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  }
});

await miniLLM.ready();
console.log('Gateway ready at:', miniLLM.url);