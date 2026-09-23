import type {Context, Next} from 'hono'

import type {Dispatchit} from '../config'

export function dispatchitHono(instance: Dispatchit): (context: Context, next: Next) => Promise<Response> {
  return async context => {
    const rawBody = await context.req.text()
    return instance.handleRequest({
      method: context.req.method,
      headers: context.req.raw.headers,
      rawBody,
    })
  }
}
