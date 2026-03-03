# Plan: Verify `llmgateway` streaming behavior (Cursor compatibility)

This plan is for *research only* to understand how [`theopenco/llmgateway`](https://github.com/theopenco/llmgateway) implements streaming, so we can ensure our gateway/SDK streaming works in Cursor.

## Goals

- Confirm the exact **streaming protocol shape** (SSE framing + JSON schema) that `llmgateway` emits for OpenAI-compatible streaming.
- Identify any **Cursor-specific expectations** (headers, `[DONE]` sentinel, chunk schema, buffering behavior) that we must match.
- Produce a concrete checklist of **what our gateway must do** for Cursor streaming to work reliably.

## Non-goals

- No modifications to this repo’s SDK/gateway yet (this is investigation + documentation only).
- No vendoring `llmgateway` code into this repo.

## Where to clone `llmgateway` (gitignored)

Clone the repo into `research/` so it stays **out of git**.

- `research/` is already ignored by this repo’s `.gitignore`.
- Keep all notes, screenshots, and scratch scripts under `research/` as well.

Suggested local path:

- `research/llmgateway/`

## Research steps (what to inspect in `llmgateway`)

### 1) Locate the streaming implementation

In the cloned `research/llmgateway/` repo, identify:

- The OpenAI-compatible route(s), typically:
  - `POST /v1/chat/completions` with `"stream": true`
  - (Possibly) newer OpenAI routes (e.g. `responses`) depending on their implementation
- The code responsible for:
  - Setting **SSE headers**
  - Writing `data: ...\n\n` frames
  - Emitting the `[DONE]` termination frame
  - Flushing / avoiding buffering
  - Handling client disconnect (abort)

Capture filenames + key functions for reference in our notes.

### 2) Document the exact HTTP + SSE details

For a streaming request, document:

- **Response headers**
  - `Content-Type` (should be `text/event-stream`)
  - `Cache-Control` (commonly `no-cache`)
  - `Connection` (commonly `keep-alive`)
  - Any anti-buffering header (common: `X-Accel-Buffering: no`)
- **Framing**
  - Each chunk should be `data: <json>\n\n`
  - Stream termination should be `data: [DONE]\n\n`
- **Chunk JSON schema**
  - Common OpenAI chunk fields:
    - `id`, `object: "chat.completion.chunk"`, `created`, `model`
    - `choices: [{ index, delta: { role?, content? }, finish_reason? }]`
  - Whether they include extra fields (usage, tool calls) and *when*.

### 3) Compare to Cursor’s expectations (practical checklist)

Cursor generally behaves like an OpenAI-compatible client. Validate these behaviors in practice:

- **Incremental rendering**: tokens appear progressively (not buffered until the end).
- **No JSON parse errors**: every `data:` payload is valid JSON (except `[DONE]`).
- **Completion semantics**: `finish_reason` arrives and stream closes cleanly.
- **Abort semantics**: client cancellation closes the connection without server errors.
- **Tool/function calling (if used)**: streamed tool-call deltas (if present) do not break parsing.

### 4) Reproduce with minimal clients (outside Cursor)

Use at least two sanity checks:

- `curl -N` (ensures you can see chunk boundaries and whether it buffers)
- A tiny Node script that reads the response body stream and prints each SSE frame

Keep these scripts under `research/llmgateway/` (or `research/scripts/`) so they remain gitignored.

### 5) Cursor integration test (the real signal)

Configure Cursor to point at the test gateway base URL (OpenAI-compatible mode), then:

- Run a prompt with streaming enabled
- Verify it streams smoothly (no stalls, no “waiting…” until end)
- Verify longer outputs keep streaming (no server timeouts)

Record:

- Cursor version + settings used
- Whether it hits `chat/completions` and what payload it sends
- Any headers Cursor requires (or sends) that affect streaming

## Deliverables from this research

Create/keep (under `research/`) a short “findings” note with:

- The specific `llmgateway` files/functions that implement streaming
- Exact headers + SSE format + chunk JSON examples (redact keys)
- A “Cursor compatibility checklist” we can apply to our gateway
- A list of changes needed (if any) to match Cursor behavior

## Acceptance criteria

- We can state precisely: **what Cursor needs** from streaming (protocol + schema + buffering behavior).
- We can state precisely: **what `llmgateway` does** (and whether Cursor succeeds with it).
- We have a short, actionable diff-list for our gateway/SDK (even if it’s “no changes needed”).

