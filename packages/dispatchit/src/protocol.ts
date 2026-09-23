import {createHmac, timingSafeEqual} from 'node:crypto'

import type {StandardSchemaV1} from '@standard-schema/spec'

import type {DispatchitConfig, OnFail} from './config'
import {toJsonSchema, validateValue} from './schema'

const signaturePattern = /^sha256=([0-9a-f]{64})$/
// Requests carrying a timestamp older than this are rejected as replays.
const maxTimestampAgeSeconds = 300

export async function handleDispatchitRequest(
  config: DispatchitConfig,
  request: {method: string; headers: Headers; rawBody: string}
): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse(405, {error: 'Method not allowed'})
  if (!isSignatureValid(config.webhookSecret, request)) return jsonResponse(401, {error: 'Invalid signature'})

  let payload: unknown
  try {
    payload = JSON.parse(request.rawBody)
  } catch {
    return jsonResponse(400, {error: 'Invalid JSON body'})
  }
  if (!isRecord(payload)) return jsonResponse(400, {error: 'Invalid payload'})
  if (!isFreshTimestamp(payload)) return jsonResponse(401, {error: 'Expired request'})

  switch (payload.request) {
    case 'ping':
      return jsonResponse(200, {})
    case 'capabilities':
      return capabilitiesResponse(config)
    case 'auth':
      return authResponse(config, payload)
    case 'invoke':
      return invokeResponse(config, payload)
    default:
      return jsonResponse(400, {error: 'Unknown request type'})
  }
}

async function authResponse(config: DispatchitConfig, payload: Record<string, unknown>): Promise<Response> {
  if (typeof payload.phoneNumber !== 'string') return jsonResponse(400, {error: 'Missing phoneNumber'})
  try {
    const authorized = await config.onAuth({phoneNumber: payload.phoneNumber})
    return jsonResponse(200, {authorized})
  } catch {
    return jsonResponse(500, {error: 'Auth check failed'})
  }
}

async function invokeResponse(config: DispatchitConfig, payload: Record<string, unknown>): Promise<Response> {
  if (typeof payload.name !== 'string') return jsonResponse(400, {error: 'Missing capability name'})
  const capability = config.capabilities[payload.name]
  if (!capability) return jsonResponse(400, {error: `Unknown capability: ${payload.name}`})
  if (!isRecord(payload.context) || typeof payload.context.phoneNumber !== 'string') {
    return jsonResponse(400, {error: 'Missing context.phoneNumber'})
  }
  const context = {phoneNumber: payload.context.phoneNumber}

  const inputResult = await validateValue(capability.input, payload.input)
  if (inputResult.issues) return capabilityFailure(capability.onFail, inputResult.issues)

  let result: unknown
  try {
    result = await capability.handler({input: inputResult.value, context})
  } catch {
    return capabilityFailure(capability.onFail)
  }

  const resultValidation = await validateValue(capability.onSuccess, result)
  if (resultValidation.issues) return capabilityFailure(capability.onFail)

  return jsonResponse(200, {success: true, result: resultValidation.value})
}

function capabilityFailure(onFail: OnFail, issues?: ReadonlyArray<StandardSchemaV1.Issue>): Response {
  const directive = 'action' in onFail ? {action: onFail.action} : {message: onFail.message}
  return jsonResponse(200, {success: false, ...directive, ...(issues ? {issues} : {})})
}

function capabilitiesResponse(config: DispatchitConfig): Response {
  const capabilities = Object.entries(config.capabilities).map(([name, capability]) => ({
    name,
    description: capability.description,
    input: toJsonSchema(capability.input, 'input'),
    result: toJsonSchema(capability.onSuccess, 'output'),
    onFail: capability.onFail,
    access: capability.access ?? 'customer',
  }))
  return jsonResponse(200, {capabilities})
}

function isSignatureValid(secret: string, request: {headers: Headers; rawBody: string}): boolean {
  const match = signaturePattern.exec(request.headers.get('x-dispatchit-signature') ?? '')
  if (!match) return false
  const expected = createHmac('sha256', secret).update(request.rawBody, 'utf8').digest('hex')
  return timingSafeEqualText(expected, match[1])
}

function timingSafeEqualText(expected: string, provided: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8')
  const providedBytes = Buffer.from(provided, 'utf8')
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
}

function isFreshTimestamp(payload: Record<string, unknown>): boolean {
  if (typeof payload.timestamp !== 'number') return true
  const ageSeconds = Math.abs(Date.now() / 1000 - payload.timestamp)
  return ageSeconds <= maxTimestampAgeSeconds
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonResponse(status: number, body: unknown): Response {
  return Response.json(body, {status})
}
