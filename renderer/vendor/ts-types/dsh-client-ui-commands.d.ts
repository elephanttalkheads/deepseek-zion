/**
 * Type-only stub for `@deepseek-ai/dsh-client-ui-commands/client` (the
 * command-ui contract face; the full package is not vendored yet — P3
 * `/` `@` MenuView scope). Session parameters are widened to `unknown` so the
 * stub stays independent of ui-input-trigger's ClientSessionContext.
 */
declare module '@deepseek-ai/dsh-client-ui-commands/client' {
  /** Copy for an option that must be acknowledged before onSelect can run. */
  export interface SelectConfirmation {
    readonly title: string
    readonly description: string
    readonly acknowledgeLabel: string
    readonly cancelLabel: string
    readonly confirmLabel: string
  }

  /** One option row of a popupSelect shell. */
  export interface SelectOption {
    readonly id: string
    readonly label: string
    readonly detail?: string
    readonly active?: boolean
    /** Optional in-page risk gate owned by the shared popup shell. */
    readonly confirmation?: SelectConfirmation
  }

  /** Business registration for the popupSelect command kind. */
  export type CommandUiSpec = {
    readonly kind: 'popupSelect'
    options(session: unknown, signal: AbortSignal): Promise<readonly SelectOption[]>
    onSelect(option: SelectOption, session: unknown): void | Promise<void>
  }

  /** One client-owned command contribution (slash-menu entry). */
  export interface CommandContribution {
    readonly name: string
    readonly description: string
    /** Capability filter, called with a fresh projection per candidate pass. */
    available(session: unknown): boolean
    readonly ui: CommandUiSpec
  }

  /** A UI decoration hung on one HOST command (bare-invocation popup). */
  export interface CommandDecoration {
    /** The HOST command name this decorates (without the leading slash). */
    readonly name: string
    /** Capability filter, called with a fresh projection per bare invocation. */
    available(session: unknown): boolean
    readonly ui: CommandUiSpec
  }

  /** The `ctx.commandUi` service face visible to business packages. */
  export interface CommandUiContract {
    /** Register one client command contribution; effect disposer. */
    register(contribution: CommandContribution): () => void
    /** Hang a bare-invocation decoration on one host command; effect disposer. */
    decorate(decoration: CommandDecoration): () => void
    /** Resolve the per-session popup controller for one session scope (wiring/overlay layer). */
    popupFor(actx: unknown): unknown
  }
}
