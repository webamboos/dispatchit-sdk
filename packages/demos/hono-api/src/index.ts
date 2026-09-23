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

export default app
