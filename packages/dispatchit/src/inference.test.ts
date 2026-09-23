import {expectTypeOf, test} from 'vitest'
import * as z from 'zod'

import {defineCapability, dispatchit} from './config'

test('capability handlers receive typed input and context', async () => {
  const capability = defineCapability({
    description: 'Apply to a job',
    input: z.object({jobId: z.string().trim()}),
    onSuccess: z.object({status: z.string().trim()}),
    onFail: {action: 'reroute-to-human'},
    handler: async ({input, context}) => {
      expectTypeOf(input).toEqualTypeOf<{jobId: string}>()
      expectTypeOf(context.phoneNumber).toEqualTypeOf<string>()
      return {status: 'applied'}
    },
  })
  expectTypeOf(capability.handler).toBeFunction()
})

test('empty success payloads accept an empty object', () => {
  defineCapability({
    description: 'Apply to a job',
    input: z.object({jobId: z.string().trim()}),
    onSuccess: z.object({}),
    onFail: {action: 'reroute-to-human'},
    handler: async () => ({}),
  })
})

test('handler input rejects unknown properties', () => {
  defineCapability({
    description: 'Apply to a job',
    input: z.object({jobId: z.string().trim()}),
    onSuccess: z.object({status: z.string().trim()}),
    onFail: {message: 'Try again later.'},
    handler: async ({input}) => {
      // @ts-expect-error unknown properties are rejected
      expect(input.nonexistent).toBeUndefined()
      return {status: 'applied'}
    },
  })
})

test('handler return must match the onSuccess schema', () => {
  defineCapability({
    description: 'Apply to a job',
    input: z.object({jobId: z.string().trim()}),
    onSuccess: z.object({status: z.string().trim()}),
    onFail: {message: 'Try again later.'},
    // @ts-expect-error the return must match the onSuccess schema
    handler: async () => ({unexpected: true}),
  })
})

test('dispatchit accepts a config of wrapped capabilities', () => {
  dispatchit({
    webhookSecret: 'secret',
    onAuth: async ({phoneNumber}) => {
      expectTypeOf(phoneNumber).toEqualTypeOf<string>()
      return true
    },
    capabilities: {
      applyToJob: defineCapability({
        description: 'Apply to a job',
        input: z.object({jobId: z.string().trim()}),
        onSuccess: z.object({status: z.string().trim()}),
        onFail: {action: 'reroute-to-human'},
        handler: async ({input}) => ({status: input.jobId}),
      }),
    },
  })
})
