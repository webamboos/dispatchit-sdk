import {createHmac} from 'node:crypto'

import {describe, expect, test} from 'vitest'
import * as z from 'zod'

import {defineCapability, dispatchit} from './config'

const webhookSecret = 'test-secret'

function createInstance() {
  return dispatchit({
    webhookSecret,
    onAuth: async ({phoneNumber}) => phoneNumber === '+15550001',
    capabilities: {
      applyToJob: defineCapability({
        description: 'Apply to a job',
        input: z.object({jobId: z.string().trim()}),
        onSuccess: z.object({status: z.string().trim()}),
        onFail: {action: 'reroute-to-human'},
        handler: async ({input}) => ({status: `applied-${input.jobId}`}),
      }),
      listApplicants: defineCapability({
        description: 'List applicants',
        input: z.object({query: z.string().trim()}),
        onSuccess: z.object({total: z.number()}),
        onFail: {message: 'Try again later.'},
        handler: async ({input, context}) => {
          if (input.query === 'boom') throw new Error('boom')
          return {total: input.query.length + context.phoneNumber.length}
        },
      }),
      brokenShape: defineCapability({
        description: 'Returns the wrong shape on purpose',
        input: z.object({query: z.string().trim()}),
        onSuccess: z.object({total: z.number()}),
        onFail: {message: 'Broken.'},
        handler: async () => ({wrong: 'shape'}) as unknown as {total: number},
      }),
    },
  })
}

function signedRaw(rawBody: string, secret = webhookSecret): {method: string; headers: Headers; rawBody: string} {
  return {
    method: 'POST',
    headers: new Headers({
      'x-dispatchit-signature': `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`,
    }),
    rawBody,
  }
}

function signedPost(payload: unknown, secret = webhookSecret): {method: string; headers: Headers; rawBody: string} {
  return signedRaw(JSON.stringify(payload), secret)
}

async function jsonBody<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}

describe('signature verification', () => {
  test('rejects non-POST requests', async () => {
    const response = await createInstance().handleRequest({
      method: 'GET',
      headers: new Headers(),
      rawBody: '',
    })
    expect(response.status).toBe(405)
  })

  test('rejects a missing signature', async () => {
    const response = await createInstance().handleRequest({
      method: 'POST',
      headers: new Headers(),
      rawBody: JSON.stringify({request: 'ping'}),
    })
    expect(response.status).toBe(401)
  })

  test('rejects a tampered body', async () => {
    const request = signedPost({request: 'ping'})
    const response = await createInstance().handleRequest({
      ...request,
      rawBody: `${request.rawBody} `,
    })
    expect(response.status).toBe(401)
  })

  test('rejects the wrong secret', async () => {
    const response = await createInstance().handleRequest(signedPost({request: 'ping'}, 'other-secret'))
    expect(response.status).toBe(401)
  })

  test('rejects a malformed signature header', async () => {
    const response = await createInstance().handleRequest({
      method: 'POST',
      headers: new Headers({'x-dispatchit-signature': 'sha256=not-hex'}),
      rawBody: JSON.stringify({request: 'ping'}),
    })
    expect(response.status).toBe(401)
  })

  test('rejects a stale timestamp', async () => {
    const stale = {request: 'ping', timestamp: Math.floor(Date.now() / 1000) - 1000}
    const response = await createInstance().handleRequest(signedPost(stale))
    expect(response.status).toBe(401)
  })

  test('accepts a fresh timestamp', async () => {
    const fresh = {request: 'ping', timestamp: Math.floor(Date.now() / 1000)}
    const response = await createInstance().handleRequest(signedPost(fresh))
    expect(response.status).toBe(200)
  })
})

describe('payload handling', () => {
  test('rejects invalid JSON', async () => {
    const response = await createInstance().handleRequest(signedRaw('not-json'))
    expect(response.status).toBe(400)
  })

  test('rejects unknown request types', async () => {
    const response = await createInstance().handleRequest(signedPost({request: 'nope'}))
    expect(response.status).toBe(400)
  })

  test('responds to ping', async () => {
    const response = await createInstance().handleRequest(signedPost({request: 'ping'}))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
  })
})

describe('capabilities manifest', () => {
  test('serves JSON Schema specs for every capability', async () => {
    const response = await createInstance().handleRequest(signedPost({request: 'capabilities'}))
    const body = await jsonBody<{
      capabilities: Array<{
        name: string
        description: string
        input: Record<string, unknown>
        result: Record<string, unknown>
        onFail: unknown
      }>
    }>(response)
    expect(body.capabilities).toHaveLength(3)

    const applyToJob = body.capabilities.find((capability: {name: string}) => capability.name === 'applyToJob')
    expect(applyToJob).toBeDefined()
    expect(applyToJob?.description).toBe('Apply to a job')
    expect(applyToJob?.input).toMatchObject({
      type: 'object',
      properties: {jobId: {type: 'string'}},
    })
    expect(applyToJob?.result).toMatchObject({
      type: 'object',
      properties: {status: {type: 'string'}},
    })
    expect(applyToJob?.onFail).toEqual({action: 'reroute-to-human'})
  })
})

describe('auth', () => {
  test('returns authorized true for known numbers', async () => {
    const response = await createInstance().handleRequest(signedPost({request: 'auth', phoneNumber: '+15550001'}))
    expect(await response.json()).toEqual({authorized: true})
  })

  test('returns authorized false for unknown numbers', async () => {
    const response = await createInstance().handleRequest(signedPost({request: 'auth', phoneNumber: '+15559999'}))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({authorized: false})
  })

  test('rejects a missing phone number', async () => {
    const response = await createInstance().handleRequest(signedPost({request: 'auth'}))
    expect(response.status).toBe(400)
  })
})

describe('invoke', () => {
  const instance = createInstance()

  test('runs the handler and validates the result', async () => {
    const response = await instance.handleRequest(
      signedPost({
        request: 'invoke',
        name: 'applyToJob',
        input: {jobId: 'job-1'},
        context: {phoneNumber: '+15550001'},
      })
    )
    expect(await response.json()).toEqual({success: true, result: {status: 'applied-job-1'}})
  })

  test('passes the phone number to the handler', async () => {
    const response = await instance.handleRequest(
      signedPost({
        request: 'invoke',
        name: 'listApplicants',
        input: {query: 'nanny'},
        context: {phoneNumber: '+15550001'},
      })
    )
    expect(await response.json()).toEqual({
      success: true,
      result: {total: 'nanny'.length + '+15550001'.length},
    })
  })

  test('returns the onFail directive for invalid input', async () => {
    const response = await instance.handleRequest(
      signedPost({
        request: 'invoke',
        name: 'applyToJob',
        input: {jobId: 123},
        context: {phoneNumber: '+15550001'},
      })
    )
    const body = await jsonBody<{success: boolean; action?: string; issues: unknown[]}>(response)
    expect(body.success).toBe(false)
    expect(body.action).toBe('reroute-to-human')
    expect(body.issues.length).toBeGreaterThan(0)
  })

  test('returns the onFail message directive when the handler throws', async () => {
    const response = await instance.handleRequest(
      signedPost({
        request: 'invoke',
        name: 'listApplicants',
        input: {query: 'boom'},
        context: {phoneNumber: '+15550001'},
      })
    )
    expect(await response.json()).toEqual({success: false, message: 'Try again later.'})
  })

  test('returns the onFail directive when the result does not match onSuccess', async () => {
    const response = await instance.handleRequest(
      signedPost({
        request: 'invoke',
        name: 'brokenShape',
        input: {query: 'x'},
        context: {phoneNumber: '+15550001'},
      })
    )
    expect(await response.json()).toEqual({success: false, message: 'Broken.'})
  })

  test('rejects unknown capabilities', async () => {
    const response = await instance.handleRequest(
      signedPost({
        request: 'invoke',
        name: 'nope',
        input: {},
        context: {phoneNumber: '+15550001'},
      })
    )
    expect(response.status).toBe(400)
  })

  test('rejects missing capability name', async () => {
    const response = await instance.handleRequest(
      signedPost({request: 'invoke', input: {}, context: {phoneNumber: '+15550001'}})
    )
    expect(response.status).toBe(400)
  })

  test('rejects missing context phone number', async () => {
    const response = await instance.handleRequest(
      signedPost({request: 'invoke', name: 'applyToJob', input: {jobId: 'job-1'}, context: {}})
    )
    expect(response.status).toBe(400)
  })
})
