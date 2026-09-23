import type {StandardJSONSchemaV1, StandardSchemaV1} from '@standard-schema/spec'

/**
 * A Standard Schema that can both validate values and convert to JSON Schema.
 * Zod 4, Valibot and ArkType schemas satisfy this out of the box.
 */
export interface SchemaV1<Input = unknown, Output = Input> extends StandardSchemaV1<Input, Output> {
  readonly '~standard': StandardSchemaV1.Props<Input, Output> & StandardJSONSchemaV1.Props<Input, Output>
}

export type ValidationResult<Output> =
  | {value: Output; issues?: undefined}
  | {value?: undefined; issues: ReadonlyArray<StandardSchemaV1.Issue>}

export async function validateValue<Output>(
  schema: SchemaV1<unknown, Output>,
  value: unknown
): Promise<ValidationResult<Output>> {
  return schema['~standard'].validate(value)
}

const jsonSchemaTarget: StandardJSONSchemaV1.Target = 'draft-2020-12'

export function toJsonSchema(schema: SchemaV1, direction: 'input' | 'output'): Record<string, unknown> {
  return schema['~standard'].jsonSchema[direction]({target: jsonSchemaTarget})
}
