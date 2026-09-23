# hono-api

Demo webhook endpoint for Dispatchit (Hono / Node) built on [`dispatchit`](../../dispatchit) and Hono. It exposes mocked delivery/logistics capabilities the Dispatchit assistant can invoke during a conversation. It has no database, deliveries are seeded in memory per phone number.

## Running

```bash
pnpm dev                      # from the repo root, alongside the other packages
pnpm --filter hono-api dev   # or on its own
```

## Connecting Dispatchit

1. Start this package.
2. In the Dispatchit app (Settings → Webhooks), configure:
   - URL: `http://127.0.0.1:4100/api/webhooks/dispatchit`
   - Signing key: the same secret this package verifies with (`DEMO_WEBHOOK_SECRET`, defaults to `dev-webhook-secret`).
3. Press **Test** — Dispatchit sends a signed ping and the webhook flips to ready.

## Environment

| Variable              | Default              | Purpose                                             |
| --------------------- | -------------------- | --------------------------------------------------- |
| `DEMO_WEBHOOK_SECRET` | `dev-webhook-secret` | HMAC secret used to verify requests from Dispatchit |
| `DEMO_API_PORT`       | `4100`               | HTTP port                                           |
| `DEMO_API_HOST`       | `127.0.0.1`          | Bind address (`0.0.0.0` inside the Docker image)    |

## Capabilities

| Capability           | Purpose                                            | Failure behavior                        |
| -------------------- | -------------------------------------------------- | --------------------------------------- |
| `listOrders`         | List the customer's deliveries with status and ETA | Tells the assistant to try again later  |
| `getDeliveryStatus`  | Look up one delivery by order id                   | Tells the assistant the id wasn't found |
| `rescheduleDelivery` | Reschedule a confirmed delivery to a new date      | Reroutes the conversation to a human    |

Seeded deliveries per phone number: `DLV-1001` (out for delivery, today), `DLV-1002` (confirmed, in 3 days),
`DLV-1003` (delivered, 2 days ago). Only `confirmed` deliveries can be rescheduled.
