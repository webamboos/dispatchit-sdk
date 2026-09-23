import {serve} from '@hono/node-server'
import {dispatchitHono} from 'dispatchit/adapters/hono'
import {Hono} from 'hono'

import {config} from './config'

const app = new Hono()

app.get('/', context => context.json({status: 'ok'}))

app.use(
  '/api/webhooks/dispatchit',
  async (context, next) => {
    const startedAt = Date.now()
    await next()
    console.log(`${context.req.method} ${context.req.path} -> ${context.res.status} (${Date.now() - startedAt}ms)`)
  },
  dispatchitHono(config)
)

const port = Number(process.env.DEMO_API_PORT ?? 4100)
const hostname = process.env.DEMO_API_HOST ?? '127.0.0.1'

serve({fetch: app.fetch, port, hostname}, () => {
  console.log(`hono-api listening on http://${hostname}:${port}`)
  console.log(`webhook endpoint: http://${hostname}:${port}/api/webhooks/dispatchit`)
})
