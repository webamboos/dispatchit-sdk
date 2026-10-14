import {loadEnvFile} from 'node:process'
try {
  loadEnvFile()
} catch {}

import {dispatchitExpress} from 'dispatchit/adapters/express'
import type {DispatchitRequest} from 'dispatchit/adapters/express'
import express from 'express'

import {config} from './config.ts'

const port = Number(process.env.PORT ?? 8787)

const app = express()

app.get('/', (_request, response) => {
  response.json({status: 'ok'})
})

app.post(
  '/api/webhooks/dispatchit',
  // Capture the raw body before parsing — Dispatchit verifies HMAC signatures against it.
  express.json({
    // body-parser's verify hook inherently receives (req, res, buf).
    // oxlint-disable-next-line max-params
    verify: (request, _response, buffer) => {
      ;(request as DispatchitRequest).rawBody = buffer
    },
  }),
  dispatchitExpress(config)
)

app.listen(port, () => {
  console.log(`express-api listening on http://127.0.0.1:${port}`)
})
