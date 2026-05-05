# Threading and message-bus model

Owned by `figma-api-engineer`. Documents the code ↔ ui split, message-bus contract, state model, and error/progress contracts.

One file per major flow or per message-bus version.

Required content per `.claude/agents/figma-api-engineer.md` §"Standard deliverable":

- Architecture diagram (boxes + arrows for message bus)
- Message-bus schema reference (link to `shared/messages.ts`)
- State map (state name, owner, reactivity, lifetime)
- Latency budgets per round-trip
- Error taxonomy
- Reference flow walkthroughs
