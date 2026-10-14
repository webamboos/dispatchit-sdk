# dispatchit

Framework-agnostic SDK for building Dispatchit webhook endpoints. It lets you expose typed **capabilities** — small, schema-validated operations — that the Dispatchit assistant can invoke on your backend during a conversation, along with an auth hook to decide which users are allowed in.

## Installation

```bash
pnpm add dispatchit
```

The SDK has zero runtime dependencies. Schemas are provided through the [Standard Schema](https://standardschema.dev) interface, so any compliant validation library works — Zod 4, Valibot and ArkType are supported out of the box.

## Quick start

Define your config once, then mount the adapter for your framework:

```ts
import {defineCapability, dispatchit} from 'dispatchit'
import {dispatchitHono} from 'dispatchit/adapters/hono'
import * as z from 'zod'
import {applyToJob, searchApplicants} from './your-db'

export const config = dispatchit({
  webhookSecret: process.env.ANSWR_WEBHOOK_SECRET!,
  onAuth: async ({phoneNumber}) => {
    // Return whether this user is allowed to use the assistant.
    return userExists(phoneNumber)
  },
  capabilities: {
    applyToJob: defineCapability({
      description: 'Applies the user to a specific job.',
      input: z.object({jobId: z.string().trim()}),
      onSuccess: z.object({status: z.string()}),
      onFail: {action: 'reroute-to-human'},
      handler: async ({input, context}) => {
        return applyToJob(input.jobId, context.phoneNumber)
      },
    }),
    listApplicants: defineCapability({
      description: 'On an empty result tell the user there are no results.',
      input: z.object({query: z.string().trim()}),
      onSuccess: z.object({total: z.number(), applicants: z.array(z.string())}),
      onFail: {message: 'Try again later.'},
      handler: async ({input, context}) => {
        return searchApplicants(input.query, context.phoneNumber)
      },
    }),
  },
})

const app = new Hono()
app.use('/api/webhooks/dispatchit', dispatchitHono(config))
```

### Express

Express consumes the raw body while parsing it, but signature verification needs the un-parsed payload — so
capture the raw body with a parser-level `verify` hook before mounting the adapter:

```ts
import {dispatchitExpress} from 'dispatchit/adapters/express'
import type {DispatchitRequest} from 'dispatchit/adapters/express'
import express from 'express'

const app = express()

app.post(
  '/api/webhooks/dispatchit',
  express.json({
    verify: (req, res, buf) => {
      ;(req as DispatchitRequest).rawBody = buf
    },
  }),
  dispatchitExpress(config)
)
```

Works with Express 4 and 5. Requests that reach the adapter without a captured `rawBody` fail with a
descriptive error.

## Concepts

### Capabilities

A capability is a single operation the assistant can perform. Each one has:

| Property      | Purpose                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------- |
| `description` | Tells the assistant what the capability does and how to use it.                                                 |
| `input`       | Standard Schema validated against the payload the assistant sends.                                              |
| `onSuccess`   | Standard Schema your handler's return value must match.                                                         |
| `onFail`      | What the assistant should do when the capability cannot be completed.                                           |
| `handler`     | Your business logic. Receives `{input, context}` where `context.phoneNumber` identifies the authenticated user. |

`onFail` supports two directives:

```ts
{
  action: 'reroute-to-human'
} // Hand the conversation to a human operator
{
  message: 'Try again later.'
} // Tell the assistant what to say instead
```

Every failure path — invalid input, a thrown handler, a result that doesn't match `onSuccess` — is answered with the capability's `onFail` directive, so a broken capability never breaks a conversation.

## Protocol

All requests are `POST` with a JSON body, signed with the webhook secret:

```
x-dispatchit-signature: sha256=<hex hmac-sha256 of the raw request body>
```

Signatures are compared timing-safely. If the payload includes a `timestamp` (unix seconds), requests older than 5 minutes are rejected as replays. Invalid signatures get `401`, malformed payloads get `400`, unknown request types get `400`.

Routing happens on the `request` field of the payload:

| Request payload                                            | Response                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `{request: 'ping'}`                                        | `200 {}` — health check used when registering the webhook          |
| `{request: 'capabilities'}`                                | `200 {capabilities: [...]}` — manifest with JSON Schema specs      |
| `{request: 'auth', phoneNumber}`                           | `200 {authorized: boolean}` — runs your `onAuth` hook              |
| `{request: 'invoke', name, input, context: {phoneNumber}}` | `200 {success: true, result}` or `200 {success: false, ...onFail}` |

The capabilities manifest is generated from your schemas through the [Standard JSON Schema](https://standardschema.dev) interface (`draft-2020-12`), so the platform knows each capability's accepted input shape, result shape, description and failure directive without any extra registration step.

## Building

```bash
pnpm build      # Bundle with rolldown into dist/ (ESM + .d.ts)
pnpm test       # Unit tests
pnpm typecheck  # tsc --noEmit
```

The package ships two entry points, both ESM:

- `dispatchit` — core
- `dispatchit/adapters/*` — framework adapters (`express` and `hono` today)

`express` and `hono` are optional peer dependencies — only install the one(s) matching the adapter you use.

## Releasing

Releases are managed with [Changesets](https://github.com/changesets/changesets) — see
[`.changeset/README.md`](../.changeset/README.md) in the repository root for the full flow:

1. Add a changeset on your PR (`pnpm changeset`).
2. Merging to `main` opens a _Version Packages_ PR that bumps the version and writes `CHANGELOG.md`.
3. Merging that PR publishes to npm and tags the release.
