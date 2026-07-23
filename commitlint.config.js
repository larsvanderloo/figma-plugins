// Git history is this repo's only spec, so commit messages must carry the why;
// the type list adds `bump` and `ui`, which are missing from the stock preset.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'perf', 'chore', 'docs', 'test', 'ci', 'bump', 'ui'],
    ],
    // Real subjects run to ~75 chars; 90 leaves headroom without inviting paragraphs.
    'header-max-length': [2, 'always', 90],
    // Warn, don't block: self-explanatory bump/chore commits still pass,
    // while every substantive change gets nudged to explain its why.
    'body-empty': [1, 'never'],
    // Warn only: bodies sometimes paste node IDs / paths longer than 100 chars.
    'body-max-line-length': [1, 'always', 100],
  },
};
