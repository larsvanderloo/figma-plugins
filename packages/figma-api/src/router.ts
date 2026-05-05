// Message-bus router. Used by code/ to dispatch incoming messages to
// typed handlers and reply with typed envelopes.
//
// Owner: figma-api-engineer (router shape) + figma-api-engineer (handler impl).

export type MessageEnvelope<T extends string, P> = {
  type: T;
  version: number;
  payload?: P;
  correlationId?: string;
};

export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E };

export type Handler<P, R> = (payload: P) => Promise<Result<R>> | Result<R>;

/**
 * Build a typed router. Plugins wire their handlers and pass the resulting
 * router into `figma.ui.onmessage`. Versioning is checked at the boundary;
 * mismatched versions are logged and dropped.
 *
 * Example:
 *
 *   const router = createRouter({ version: 1 });
 *   router.on("apply-edit", async (payload) => ({ ok: true, data: { ... } }));
 *   figma.ui.onmessage = router.handle;
 */
export function createRouter(opts: { version: number }) {
  const handlers = new Map<string, Handler<unknown, unknown>>();

  return {
    on<P, R>(type: string, handler: Handler<P, R>) {
      handlers.set(type, handler as Handler<unknown, unknown>);
    },
    async handle(msg: MessageEnvelope<string, unknown>) {
      if (msg.version !== opts.version) {
        console.error(
          `message-bus version mismatch: got ${msg.version}, expected ${opts.version}`,
        );
        return;
      }
      const handler = handlers.get(msg.type);
      if (!handler) {
        console.warn(`unhandled message type: ${msg.type}`);
        return;
      }
      const result = await handler(msg.payload);
      if (msg.correlationId !== undefined) {
        figma.ui.postMessage({
          type: `${msg.type}:result`,
          version: opts.version,
          payload: result,
          correlationId: msg.correlationId,
        });
      }
    },
  };
}
