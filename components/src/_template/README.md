# Component template

Copy this folder to `components/src/<Name>/` and rename `Component.vue` → `<Name>.vue` (and `.test.ts`). Replace this README with the component's actual documentation.

Required sections in a real component README:

- **Purpose** — what this component does, when to reach for it.
- **Props / Emits / Slots** — typed contract.
- **Usage example** — minimum viable invocation.
- **Accessibility notes** — keyboard, screen-reader, ARIA, focus.
- **Design-token usage** — which tokens drive its appearance.
- **When NOT to use it** — boundaries against adjacent components.

Discipline: every component has a test, an axe scan, and a README. Adding without these is blocked at review per `ui-engineer`'s `.claude/agents/ui-engineer.md` §"Designing a component".
