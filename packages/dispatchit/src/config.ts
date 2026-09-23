import {handleDispatchitRequest} from './protocol'
import type {SchemaV1} from './schema'

export interface CapabilityContext {
  phoneNumber: string
}

export type OnFail = {action: 'reroute-to-human'} | {message: string}

/** Who may invoke a capability: 'public' works without customer-side verification, 'customer' requires it. */
export type CapabilityAccess = 'public' | 'customer'

export interface CapabilityDefinition<Input = any, Output = any> {
  description: string
  input: SchemaV1<any, Input>
  onSuccess: SchemaV1<any, Output>
  onFail: OnFail
  /** Defaults to `customer` — the capability is only offered to verified contacts. */
  access?: CapabilityAccess
  handler: (args: {input: Input; context: CapabilityContext}) => Promise<Output>
}

/**
 * TypeScript cannot infer handler types from sibling schema properties inside a
 * plain object literal, so capabilities must be wrapped for full type inference.
 */
export function defineCapability<Input, Output>(
  capability: CapabilityDefinition<Input, Output>
): CapabilityDefinition<Input, Output> {
  return capability
}

export interface DispatchitConfig {
  webhookSecret: string
  onAuth: (args: {phoneNumber: string}) => boolean | Promise<boolean>
  capabilities: Record<string, CapabilityDefinition>
}

export interface Dispatchit {
  handleRequest(request: {method: string; headers: Headers; rawBody: string}): Promise<Response>
}

export class DispatchitConfigError extends Error {
  type: string
  constructor(message: string) {
    super(message)
    this.type = 'CONFIG_ERROR'
  }
}

export function dispatchit(config: DispatchitConfig): Dispatchit {
  assertValidConfig(config)
  return {
    handleRequest: request => handleDispatchitRequest(config, request),
  }
}

function assertValidConfig(config: DispatchitConfig): void {
  if (typeof config.webhookSecret !== 'string' || config.webhookSecret.length === 0) {
    throw new DispatchitConfigError('webhookSecret is required')
  }
  if (typeof config.onAuth !== 'function') {
    throw new DispatchitConfigError('onAuth must be a function')
  }
  const capabilityNames = Object.keys(config.capabilities)
  if (capabilityNames.length === 0) {
    throw new DispatchitConfigError('At least one capability must be defined')
  }
  for (const name of capabilityNames) {
    assertValidCapability(name, config.capabilities[name])
  }
}

function assertValidCapability(name: string, capability: CapabilityDefinition): void {
  if (!isSchema(capability.input) || !isSchema(capability.onSuccess)) {
    throw new DispatchitConfigError(`Capability "${name}" must define input and onSuccess schemas`)
  }
  if (!capability.onFail) {
    throw new DispatchitConfigError(`Capability "${name}" must define onFail`)
  }
  if (capability.access !== undefined && capability.access !== 'public' && capability.access !== 'customer') {
    throw new DispatchitConfigError(`Capability "${name}" has an invalid access value`)
  }
  if (typeof capability.handler !== 'function') {
    throw new DispatchitConfigError(`Capability "${name}" must define a handler function`)
  }
}

function isSchema(value: unknown): value is SchemaV1 {
  const standard = (value as SchemaV1 | undefined)?.['~standard']
  return typeof standard?.validate === 'function' && typeof standard?.jsonSchema?.input === 'function'
}
