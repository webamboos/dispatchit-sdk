import {createHmac} from 'node:crypto'

import {describe, expect, test, vi} from 'vitest'
import * as z from 'zod'

import {defineCapability, dispatchit, DispatchitConfigError} from '../config'
import type {Dispatchit} from '../config'
import {dispatchitExpress} from './express'

const webhookSecret = 'test-secret'

const instance: Dispatchit = dispatchit({
  webhookSecret,
  onAuth: async () => true,
  capabilities: {
    applyToJob: defineCapability({
      description: 'Apply to a job',
      input: z.object({jobId: z.string().trim()}),
      onSuccess: z.object({status: z.string().trim()}),
      onFail: {message: 'Try again later.'},
      handler: async ({input}) => ({status: `applied-${input.jobId}`}),
    }),
  },
})

interface FakeRequest {
  method: string
  headers: Record<string, string>
  rawBody?: string
}

interface FakeResponse {
  statusCode: number
  headers: Record<string, string>
  body: string | undefined
  finished: boolean
}

function createFakeResponse(): FakeResponse & {
  status(code: number): {send(body: string): void}
  set(name: string, value: string): void
  send(body: string): void
} {
  const internal: FakeResponse = {statusCode: 200, headers: {}, body: undefined, finished: false}
  return {
    get statusCode() {
      return internal.statusCode
    },
    get headers() {
      return internal.headers
    },
    get body() {
      return internal.body
    },
    get finished() {
      return internal.finished
    },
    status(code) {
      internal.statusCode = code
      return {
        send(body) {
          internal.body = body
          internal.finished = true
        },
      }
    },
    set(name, value) {
      internal.headers[name] = value
    },
    send(body) {
      internal.body = body
      internal.finished = true
    },
  }
}

/** Minimal req/res stand-ins matching how the adapter touches the Express objects. */
function createHandlerArgs(request: FakeRequest) {
  const response = createFakeResponse()
  const next = vi.fn()
  // Fake handler type mirrors the 3-parameter Express middleware signature.
  // oxlint-disable-next-line max-params
  const handler = dispatchitExpress(instance) as unknown as (
    req: FakeRequest,
    res: ReturnType<typeof createFakeResponse>,
    next: () => void
  ) => Promise<void>
  return {
    next,
    run: () => handler(request, response, next),
    response,
  }
}

function signedBody(payload: unknown, secret = webhookSecret): FakeRequest {
  const rawBody = JSON.stringify(payload)
  return {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dispatchit-signature': `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`,
    },
    rawBody,
  }
}

describe('dispatchitExpress', () => {
  test('responds to a signed ping', async () => {
    const {run, response} = createHandlerArgs(signedBody({request: 'ping'}))
    await run()
    expect(response.statusCode).toBe(200)
    expect(response.body).toBe('{}')
    expect(response.headers['content-type']).toContain('application/json')
  })

  test('runs a capability and returns the result', async () => {
    const {run, response} = createHandlerArgs(
      signedBody({
        request: 'invoke',
        name: 'applyToJob',
        input: {jobId: 'job-1'},
        context: {phoneNumber: '+15550001'},
      })
    )
    await run()
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body!)).toEqual({success: true, result: {status: 'applied-job-1'}})
  })

  test('returns the protocol status for non-POST requests', async () => {
    const {run, response} = createHandlerArgs({method: 'GET', headers: {}, rawBody: ''})
    await run()
    expect(response.statusCode).toBe(405)
  })

  test('rejects an unsigned request with the protocol status', async () => {
    const {run, response} = createHandlerArgs({method: 'POST', headers: {}, rawBody: '{"request":"ping"}'})
    await run()
    expect(response.statusCode).toBe(401)
  })

  test('fails with a helpful error when rawBody was not captured', async () => {
    const {next, run} = createHandlerArgs({method: 'POST', headers: {}, rawBody: undefined})
    await run()
    expect(next).toHaveBeenCalledTimes(1)
    const error = next.mock.calls[0]![0] as DispatchitConfigError
    expect(error).toBeInstanceOf(DispatchitConfigError)
    expect(error.message).toContain('express.json({verify')
  })

  test('forwards protocol errors to next', async () => {
    const failing: Dispatchit = {
      handleRequest: async () => {
        throw new Error('boom')
      },
    }
    const next = vi.fn()
    // Fake handler type mirrors the 3-parameter Express middleware signature.
    // oxlint-disable-next-line max-params
    const handler = dispatchitExpress(failing) as unknown as (
      req: FakeRequest,
      res: ReturnType<typeof createFakeResponse>,
      next: () => void
    ) => Promise<void>
    await handler({method: 'POST', headers: {}, rawBody: '{}'}, createFakeResponse(), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect((next.mock.calls[0]![0] as Error).message).toBe('boom')
  })
})
