// tools/eslint-rules/welder-pinia-discipline.ts
//
// Custom ESLint rule: welder/pinia-mutation-discipline
//
// Enforces ADR-0010 §3.1 — the ONLY allowed writers to the welder-editor
// Pinia store are:
//   1. plugins/welder-editor/ui/stores/useEditorStore.ts  (store internals)
//   2. plugins/welder-editor/ui/composables/useEditorActions.ts  (action wrappers)
//
// Any other file that mutates the store triggers an `error`-level violation.
//
// Detected patterns (all outside allowed files):
//   A. Direct property assignment on a useEditorStore() return value:
//        const store = useEditorStore(); store.activeSlide = x;
//   B. $patch call:
//        store.$patch({ ... }) / store.$patch(s => { ... })
//   C. $reset call:
//        store.$reset()
//   D. $state assignment:
//        store.$state = { ... }
//   E. storeToRefs .value assignment:
//        const { activeSlide } = storeToRefs(useEditorStore()); activeSlide.value = x;
//
// Approach:
//   - Track `useEditorStore()` call-expression return identifiers per file.
//   - Track `storeToRefs(useEditorStore())` destructured ref identifiers.
//   - Flag any AssignmentExpression or CallExpression that targets those
//     identifiers outside the allowed file paths.
//
// The rule is path-gated by process.cwd()-relative filename. Files outside
// welder-editor are skipped (fast path) — the rule only fires in welder-editor.
//
// Severity: error (blocks CI). Do not downgrade to warn.

import type { Rule } from 'eslint';
import type { TSESTree } from '@typescript-eslint/utils';
import * as path from 'node:path';

// Local aliases — TSESTree extends estree with TS-specific node variants and
// is the canonical way to type ESLint rules in a TypeScript-first codebase.
// Avoids requiring @types/estree as a separate dep (per Sprint 1 Wave 2a CI fix).
type Node = TSESTree.Node;
type MemberExpression = TSESTree.MemberExpression;
type CallExpression = TSESTree.CallExpression;
type AssignmentExpression = TSESTree.AssignmentExpression;

// ---------------------------------------------------------------------------
// Allowed file paths (relative, normalised with posix separators)
// ---------------------------------------------------------------------------
const ALLOWED_PATHS = [
  'plugins/welder-editor/ui/stores/useEditorStore.ts',
  'plugins/welder-editor/ui/composables/useEditorActions.ts',
] as const;

/** Pinia store instance methods that mutate state. */
const MUTATING_METHODS = new Set(['$patch', '$reset']);

function toRelativePosix(filename: string): string {
  return path.relative(process.cwd(), filename).split(path.sep).join('/');
}

function isAllowedFile(filename: string): boolean {
  const rel = toRelativePosix(filename);
  return ALLOWED_PATHS.some((allowed) => rel.endsWith(allowed));
}

// ---------------------------------------------------------------------------
// AST node-type guards
// ---------------------------------------------------------------------------

function isCallExpression(node: Node): node is CallExpression {
  return node.type === 'CallExpression';
}

function isIdentifier(node: Node, name?: string): boolean {
  return (
    node.type === 'Identifier' && (name === undefined || (node as { name: string }).name === name)
  );
}

/** True when node is `useEditorStore()`. */
function isUseEditorStoreCall(node: Node): node is CallExpression {
  return isCallExpression(node) && isIdentifier(node.callee, 'useEditorStore');
}

/** True when node is `storeToRefs(useEditorStore())`. */
function isStoreToRefsOfEditorStore(node: Node): node is CallExpression {
  return (
    isCallExpression(node) &&
    isIdentifier(node.callee, 'storeToRefs') &&
    node.arguments.length === 1 &&
    isUseEditorStoreCall(node.arguments[0] as Node)
  );
}

// ---------------------------------------------------------------------------
// Rule implementation
// ---------------------------------------------------------------------------

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct Pinia store mutation outside useEditorStore.ts and useEditorActions.ts (ADR-0010 §3.1)',
      url: 'docs/adr/0010-welder-editor-ui-state-architecture-hybrid.md',
    },
    schema: [],
    messages: {
      directAssignment:
        'Direct store property assignment is forbidden outside the allowed mutation files. ' +
        'Mutate state through a useEditorStore action or useEditorActions instead (ADR-0010 §3.1).',
      patchOrReset:
        'Calling store.{{method}}() is forbidden outside the allowed mutation files. ' +
        'Use a useEditorStore action or useEditorActions instead (ADR-0010 §3.1).',
      stateAssignment:
        'Assigning to store.$state is forbidden outside the allowed mutation files. ' +
        'Use a useEditorStore action or useEditorActions instead (ADR-0010 §3.1).',
      storeRefAssignment:
        'Assigning to a storeToRefs() ref value is forbidden outside the allowed mutation files. ' +
        'Use a useEditorStore action or useEditorActions instead (ADR-0010 §3.1).',
    },
  },

  create(context) {
    const filename = context.getFilename();

    // Fast-path: only check welder-editor files, and skip allowed files.
    const relFilename = toRelativePosix(filename);
    if (!relFilename.includes('welder-editor')) return {};
    if (isAllowedFile(filename)) return {};

    // -----------------------------------------------------------------------
    // Per-file tracking
    // -----------------------------------------------------------------------

    /** Names of variables bound to `useEditorStore()` return values. */
    const storeVarNames = new Set<string>();

    /** Names of variables bound to refs from `storeToRefs(useEditorStore())`. */
    const storeRefNames = new Set<string>();

    // -----------------------------------------------------------------------
    // Visitor
    // -----------------------------------------------------------------------

    return {
      // --- Track: const store = useEditorStore()
      // --- Track: const { a, b } = storeToRefs(useEditorStore())
      VariableDeclarator(node) {
        if (!node.init) return;
        const init = node.init as Node;

        // Case 1: const store = useEditorStore()
        if (isUseEditorStoreCall(init)) {
          if (node.id.type === 'Identifier') {
            storeVarNames.add(node.id.name);
          }
          return;
        }

        // Case 2: const { activeSlide } = storeToRefs(useEditorStore())
        if (isStoreToRefsOfEditorStore(init)) {
          if (node.id.type === 'ObjectPattern') {
            for (const prop of node.id.properties) {
              if (prop.type === 'Property' && prop.value.type === 'Identifier') {
                storeRefNames.add((prop.value as { name: string }).name);
              } else if (prop.type === 'RestElement' && prop.argument.type === 'Identifier') {
                // Rest spread: const { ...rest } = storeToRefs(...)
                // We can't know which props are on rest, so we skip — this
                // would require type information. Flag if needed in a future
                // revision with @typescript-eslint/utils.
              }
            }
          }
        }
      },

      // --- Detect: store.prop = value  /  store.$state = value
      // --- Detect: ref.value = x  (where ref came from storeToRefs)
      AssignmentExpression(node) {
        const assignNode = node as unknown as AssignmentExpression;
        const left = assignNode.left;

        // Pattern A/D: store.<prop> = value
        if (
          left.type === 'MemberExpression' &&
          !left.computed &&
          left.object.type === 'Identifier' &&
          storeVarNames.has((left.object as { name: string }).name)
        ) {
          const propName =
            left.property.type === 'Identifier'
              ? (left.property as { name: string }).name
              : undefined;

          if (propName === '$state') {
            context.report({ node, messageId: 'stateAssignment' });
          } else {
            context.report({ node, messageId: 'directAssignment' });
          }
          return;
        }

        // Pattern E: storeRef.value = x
        if (
          left.type === 'MemberExpression' &&
          !left.computed &&
          left.object.type === 'Identifier' &&
          storeRefNames.has((left.object as { name: string }).name) &&
          left.property.type === 'Identifier' &&
          (left.property as { name: string }).name === 'value'
        ) {
          context.report({ node, messageId: 'storeRefAssignment' });
        }
      },

      // --- Detect: store.$patch(...)  /  store.$reset()
      CallExpression(node) {
        const callNode = node as unknown as CallExpression;
        const callee = callNode.callee;

        if (callee.type !== 'MemberExpression') return;

        const memberCallee = callee as MemberExpression;
        if (memberCallee.object.type !== 'Identifier') return;
        if (memberCallee.property.type !== 'Identifier') return;

        const objName = (memberCallee.object as { name: string }).name;
        const methodName = (memberCallee.property as { name: string }).name;

        if (storeVarNames.has(objName) && MUTATING_METHODS.has(methodName)) {
          context.report({
            node,
            messageId: 'patchOrReset',
            data: { method: methodName },
          });
        }
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Plugin export — compatible with ESLint 9 flat config
// ---------------------------------------------------------------------------

/** Drop this into an eslint.config.ts block to activate the rule. */
export const welderPiniaDisciplinePlugin = {
  plugins: {
    welder: {
      rules: {
        'pinia-mutation-discipline': rule,
      },
    },
  },
  rules: {
    'welder/pinia-mutation-discipline': 'error' as const,
  },
};

export default rule;
