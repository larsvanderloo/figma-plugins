// Commit-message gate (run by .husky/commit-msg).
//
// Git history is this repo's single source of truth — there is no spec or
// backlog doc — so commit messages must stay structured and explain the WHY.
// This config extends conventional-commits but widens the type list to the
// types this repo actually uses (notably `bump` for version bumps and `ui`
// for iframe-only changes, neither of which is in the stock preset).
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Repo's real type vocabulary (see `git log` — feat/fix/chore lead, plus
    // bump/ui/perf/ci/test). Keep this in sync if a new type earns its place.
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'perf', 'chore', 'docs', 'test', 'ci', 'bump', 'ui'],
    ],
    // Subjects here run long and descriptive (real max ~75); 90 leaves headroom
    // without inviting paragraph-length subjects.
    'header-max-length': [2, 'always', 90],
    // A body is where the "why" lives — the thing the deleted docs used to hold.
    // Warn (not block) so genuinely self-explanatory bump/dist/chore commits
    // still go through, while every substantive change gets nudged to explain.
    'body-empty': [1, 'never'],
    // Conventional default wraps the body at 100; our messages sometimes paste
    // node IDs / paths that run longer. Relax to a warning.
    'body-max-line-length': [1, 'always', 100],
  },
};
