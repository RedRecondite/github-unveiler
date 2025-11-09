# Code Coverage Setup

This document explains the code coverage configuration and how to work with it.

## Overview

Code coverage is now configured using Jest and is automatically checked in CI/CD pipelines.

### Current Coverage Status

```
Statements   : 29.4% ( 277/942 )
Branches     : 26.86% ( 166/618 )
Functions    : 39.6% ( 40/101 )
Lines        : 29.75% ( 272/914 )
```

### Current Thresholds

The following minimum coverage thresholds are enforced:
- **Branches**: 25%
- **Functions**: 35%
- **Lines**: 25%
- **Statements**: 25%

These thresholds are set slightly below current coverage to ensure tests don't regress. **The goal is to progressively increase these thresholds to 50%+ as coverage improves.**

## Running Coverage Locally

### Generate coverage report
```bash
npm run test:coverage
```

### View HTML coverage report
After running coverage, open the HTML report:
```bash
# On macOS
open coverage/lcov-report/index.html

# On Linux
xdg-open coverage/lcov-report/index.html

# On Windows
start coverage/lcov-report/index.html
```

### Run tests in watch mode (no coverage)
```bash
npm test -- --watch
```

## Coverage Reports

Coverage reports are generated in multiple formats:

1. **Terminal** - Text summary displayed after test run
2. **HTML** - Detailed interactive report in `coverage/lcov-report/`
3. **LCOV** - Machine-readable format in `coverage/lcov.info` (used by CI/CD)

## GitHub Actions Integration

Coverage is automatically checked on every push and pull request via the CI workflow (`.github/workflows/ci.yml`):

- Tests run with coverage on Node.js versions 18, 20, and 22
- Coverage thresholds are enforced - build fails if coverage drops below thresholds
- Coverage reports are uploaded to Codecov (if configured)
- Coverage summary is displayed in the CI logs

## Coverage Configuration

Coverage is configured in `package.json` under the `jest` section:

```json
"collectCoverageFrom": [
  "*.js",
  "!test/**",
  "!node_modules/**"
],
"coverageDirectory": "coverage",
"coverageReporters": ["text", "text-summary", "lcov", "html"],
"coverageThreshold": {
  "global": {
    "branches": 25,
    "functions": 35,
    "lines": 25,
    "statements": 25
  }
}
```

## Improving Coverage

See [COVERAGE_TASKS.md](./COVERAGE_TASKS.md) for a detailed list of coverage gaps and tasks to improve coverage.

### Priority Areas

1. **content.js** (0% coverage) - Critical priority
2. **options.js** (42.48% coverage) - Needs work
3. **background.js** (90% coverage) - Minor improvements
4. **content-utils.js** (96.1% coverage) - Excellent, minor gaps only

### Strategy

1. **Phase 1**: Add basic tests for core utilities (Target: 30% overall)
2. **Phase 2**: Add tests for DOM processing and UI functions (Target: 50% overall)
3. **Phase 3**: Add integration tests and edge cases (Target: 70%+ overall)

## Excluded from Coverage

The following files are excluded from coverage:
- `test/**` - Test files themselves
- `node_modules/**` - Third-party dependencies

## Best Practices

1. **Write tests first** - Consider writing tests before adding new features
2. **Check coverage locally** - Run coverage before pushing to catch regressions
3. **Focus on critical paths** - Prioritize testing main user flows and error handling
4. **Don't game the metrics** - Aim for meaningful tests, not just hitting numbers
5. **Update thresholds** - As coverage improves, update thresholds in package.json

## Troubleshooting

### Coverage threshold errors
If you see errors like:
```
Jest: "global" coverage threshold for statements (25%) not met: 20%
```

This means your changes reduced coverage below the threshold. Either:
1. Add tests to maintain coverage
2. If justified, discuss lowering thresholds with the team

### Missing coverage directory
If coverage reports aren't generated:
1. Ensure you're running `npm run test:coverage` (not just `npm test`)
2. Check that Jest is properly configured in package.json
3. Verify the coverage directory isn't in .gitignore (it should be)

### CI failing on coverage
If CI fails due to coverage but tests pass locally:
1. Ensure you've run `npm ci` to get the exact same dependencies
2. Run `npm run test:coverage` locally to see the same results
3. Check for environment-specific code that's only tested in one environment

## Resources

- [Jest Coverage Documentation](https://jestjs.io/docs/configuration#collectcoverage-boolean)
- [COVERAGE_TASKS.md](./COVERAGE_TASKS.md) - Detailed task list for coverage gaps
- [TESTING_REFACTOR_STRATEGY.md](./TESTING_REFACTOR_STRATEGY.md) - Testing strategy document
