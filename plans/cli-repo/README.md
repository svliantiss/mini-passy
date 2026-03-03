# Plan: Separate CLI repo (uses SDK, keeps codebases clean)

This plan defines a second repository for the **CLI**, kept separate from this SDK repo, so:

- The **SDK stays focused** as a library.
- The **CLI ships independently** and can evolve without mixing concerns.
- The SDK can keep using `npx @mini-passy/cli` unchanged.

## Goals

- Create a new repo that publishes a CLI package named **`@mini-passy/cli`**.
- The CLI runs the gateway/server and is compatible with:
  - `npx @mini-passy/cli`
  - `packages/sdk/src/gateway-manager.ts` (currently spawns `npx @mini-passy/cli`)
- Keep this repo as **SDK-only** (no CLI runtime requirements beyond tests/dev).

## Current constraint in this repo (why the name matters)

`packages/sdk/src/gateway-manager.ts` currently resolves the gateway command as:

- `npx @mini-passy/cli`

So the new CLI repo should publish **that** package name (or we’ll later update the SDK—but the intent here is to *avoid* touching the SDK).

## Repo outline (new repository)

Suggested repo name:

- `mini-passy-cli` (or similar), publishing to npm as `@mini-passy/cli`

Suggested structure:

- `src/`
  - `main.ts` (CLI entry)
  - `commands/` (subcommands if needed)
- `dist/` (build output)
- `package.json`
- `tsconfig.json`
- `README.md`

## Technology choices (keep it boring)

- **Package manager**: `pnpm`
- **Language**: TypeScript
- **CLI args**: `commander` (simple, robust)
- **Build**: `tsup` (or `esbuild`) to emit Node-friendly output
- **Runtime**: Node 18+ (align with fetch + streams)

## What the CLI should do (v1 scope)

### Primary behavior

- `@mini-passy/cli` should start the gateway server the SDK expects.
- Print a log line that includes the bound URL in the format the SDK already parses:
  - `running on http://127.0.0.1:<port>`

This is important because `gateway-manager.ts` extracts the actual port from stdout.

### Commands (optional, but useful for humans)

If we want the CLI to be useful directly (not only via SDK), add:

- `mini-passy start` (default): start gateway server
- `mini-passy models`: list models via gateway
- `mini-passy chat`: simple chat request with optional `--stream`
- `mini-passy doctor`: validate env/config and provider connectivity

Keep these as thin wrappers around the SDK/gateway HTTP API.

## How it uses the SDK

Two acceptable approaches:

### Option A (preferred): CLI depends on published SDK

- CLI `package.json` depends on the published SDK package (e.g. `@mini-passy/sdk`)
- Pros: clean separation, easier CI, realistic consumer
- Cons: requires publishing SDK before CLI (or using a prerelease tag during development)

### Option B: local-link for development only

- During early development, use `pnpm link` or a git dependency temporarily
- Still publish with normal semver dependency once stable

## Migration plan from this repo

This repo currently has signs of CLI-related work (e.g. untracked `packages/sdk/bin/`).

When we’re ready to execute (later, not in this plan-only step):

- Move/port any CLI runtime bits into the new CLI repo
- Ensure this repo remains:
  - SDK library code
  - gateway library code (if you still want it here), but **not** the published CLI wrapper

## Release & CI (high-level)

In the new CLI repo:

- Add a publish workflow that:
  - builds `dist/`
  - publishes `@mini-passy/cli`
- Ensure `bin` points at built entry with a shebang.

## Acceptance criteria

- `npx @mini-passy/cli` starts the gateway and logs `running on http://127.0.0.1:<port>`.
- `packages/sdk/src/gateway-manager.ts` works without modification.
- CLI repo can be developed and released independently of this SDK repo.

