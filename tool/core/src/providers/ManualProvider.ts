import type { Provider } from './Provider'
import type { FieldDef } from '../engine/schema'

/** Renders as a plain input. The developer supplies the value by hand. */
export class ManualProvider implements Provider {
  readonly name = 'manual'

  async options(_field: FieldDef): Promise<undefined> {
    return undefined
  }
}
