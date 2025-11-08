# Contributing to GitHub Unveiler

Thank you for your interest in contributing to GitHub Unveiler! This document provides guidelines and information about our development process, automated workflows, and how to make releases.

## Table of Contents

- [Development Setup](#development-setup)
- [Contributing Guidelines](#contributing-guidelines)
- [Testing](#testing)
- [GitHub Actions Workflows](#github-actions-workflows)
- [Release Process](#release-process)
- [Code Style](#code-style)

## Development Setup

### Prerequisites

- Node.js 18 or higher
- npm (comes with Node.js)
- Git

### Getting Started

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/github-unveiler.git
   cd github-unveiler
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run tests to ensure everything is working:
   ```bash
   npm test
   ```

### Dev Container (Optional)

This project includes a dev container configuration (`.devcontainer/devcontainer.json`) for consistent development environments. If you use VS Code with the Remote - Containers extension, you can open the project in a container with Node 18 and pre-configured tools.

## Contributing Guidelines

### Creating a Pull Request

1. **Create a branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** and ensure:
   - All tests pass (`npm test`)
   - Code follows existing style
   - JavaScript syntax is valid

3. **Commit your changes** with clear, descriptive commit messages:
   ```bash
   git commit -m "Add feature: description of what you added"
   ```

4. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Open a Pull Request** on GitHub with:
   - A clear title (at least 10 characters)
   - A description explaining what changes you made and why
   - Reference any related issues

### Pull Request Requirements

- PR title must be at least 10 characters
- Include a meaningful description (at least 20 characters recommended)
- All CI checks must pass
- Tests must pass on Node.js 18, 20, and 22

## Testing

### Running Tests

Run all tests:
```bash
npm test
```

### Test Structure

Tests are located in the `/test` directory and use Jest with JSDOM:

- `content.*.test.js` - Content script tests (DOM manipulation, username detection, etc.)
- `background.test.js` - Service worker tests
- `options.test.js` - Options page tests

### Writing Tests

When adding new features:
- Add corresponding tests in the `/test` directory
- Import actual production code from `content-utils.js` (don't duplicate code)
- Use ES6 module syntax (`import`/`export`)
- Follow the patterns in `content.utility.test.js` and `content.displayname.test.js`

## GitHub Actions Workflows

Our project uses several automated workflows to maintain code quality and streamline releases. These run automatically on specific events.

### CI Workflow (`.github/workflows/ci.yml`)

**Triggers:** Push or Pull Request to `main`/`master` branches

**What it does:**
- **Tests** on Node.js 18, 20, and 22 (ensures compatibility across versions)
- **Validates manifest.json** (checks JSON syntax and required fields)
- **File structure validation** (ensures all required extension files exist)
- **JavaScript syntax checking** (validates syntax in all .js files)
- **TODO/FIXME scanning** (identifies technical debt, won't fail builds)

**Matrix Testing:**
```yaml
strategy:
  matrix:
    node-version: [18, 20, 22]
```

This ensures the extension works across different Node versions used by contributors.

### Dependency Review Workflow (`.github/workflows/dependency-review.yml`)

**Triggers:**
- Pull Requests to `main`/`master`
- Weekly schedule (Mondays at 9 AM UTC)
- Manual workflow dispatch

**What it does:**
- **Outdated package detection** - Lists packages with available updates
- **Security audit** - Scans for vulnerabilities (fails on HIGH severity)
- **Dependency review** (PR only) - Analyzes dependency changes in PRs

**Note:** The dependency-review job requires GitHub Advanced Security (available on public repos or GitHub Enterprise). It's set to `continue-on-error: true` so it won't block PRs.

### PR Labeler Workflow (`.github/workflows/pr-labeler.yml`)

**Triggers:** Pull Request opened, synchronized, or reopened

**What it does:**
- **Auto-labels PRs** based on changed files:
  - `tests` - Changes to `/test/**/*`
  - `documentation` - Changes to `*.md` or `/docs/**/*`
  - `dependencies` - Changes to `package.json` or `package-lock.json`
  - `github-actions` - Changes to `.github/workflows/**/*`
  - `extension-core` - Changes to core extension files
  - `ui` - Changes to UI files (options page, icons)
- **Validates PR title** - Ensures title is at least 10 characters
- **Checks for description** - Warns if description is missing or too short

**Configuration:** Label rules are defined in `.github/labeler.yml`

### Release Workflow (`.github/workflows/release.yml`)

**Triggers:**
- Push of version tags (e.g., `v1.9.1`, `v2.0.0`)
- Manual workflow dispatch

**What it does:**
1. **Runs all tests** before creating release (ensures quality)
2. **Extracts version** from `manifest.json`
3. **Packages extension** - Creates `.zip` file with only necessary files:
   - Extension files (manifest, scripts, HTML)
   - Icons and assets
   - LICENSE and README
   - Excludes: tests, node_modules, dev files
4. **Generates changelog** - Creates changelog from git commits since last tag
5. **Creates GitHub Release** with:
   - Downloadable extension package
   - Auto-generated release notes
   - Installation instructions
   - Links to Chrome Web Store

**Package contents:**
```
github-unveiler-X.X.X.zip
├── manifest.json
├── background.js
├── content.js
├── content-utils.js
├── options.js
├── options.html
├── icon*.png (all sizes)
├── LICENSE
└── README.md
```

## Release Process

### Version Numbering

We use [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH):

- **MAJOR** version for incompatible API changes
- **MINOR** version for new functionality in a backward compatible manner
- **PATCH** version for backward compatible bug fixes

### Creating a Release

1. **Update the version** in `manifest.json`:
   ```json
   {
     "version": "1.10.0",
     ...
   }
   ```

2. **Ensure all tests pass locally**:
   ```bash
   npm test
   ```

3. **Commit the version change**:
   ```bash
   git add manifest.json
   git commit -m "Bump version to 1.10.0"
   git push origin main
   ```

4. **Create and push a version tag**:
   ```bash
   git tag v1.10.0
   git push origin v1.10.0
   ```

5. **GitHub Actions takes over**:
   - Runs all tests
   - Packages the extension
   - Creates a GitHub Release with the zip file
   - Generates release notes from commits

6. **Monitor the workflow**:
   - Go to the [Actions tab](../../actions)
   - Watch the "Release" workflow run
   - If successful, the release will appear in [Releases](../../releases)

7. **Manual Chrome Web Store upload** (for now):
   - Download the `.zip` file from the GitHub Release
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Upload the new version
   - Fill in the "What's new" section with changelog
   - Submit for review

### Release Checklist

Before creating a release tag:

- [ ] All tests pass (`npm test`)
- [ ] Version in `manifest.json` is updated
- [ ] No security vulnerabilities in dependencies (`npm audit`)
- [ ] All desired changes are merged to main
- [ ] CHANGELOG or commit messages clearly document changes
- [ ] Extension has been manually tested in Chrome

### Rollback a Release

If you need to rollback a release:

1. Delete the tag locally and remotely:
   ```bash
   git tag -d v1.10.0
   git push origin :refs/tags/v1.10.0
   ```

2. Delete the GitHub Release from the [Releases page](../../releases)

3. Create a new patch version with the fix

## Code Style

### JavaScript

- Use ES6+ features (classes, arrow functions, const/let, etc.)
- Use ES6 modules (`import`/`export`) in new code
- Follow existing code patterns and naming conventions
- Keep functions focused and single-purpose
- Add comments for complex logic

### Files

- **Utility functions**: `content-utils.js` works in both browser and test contexts
  - Loaded as a script in the extension (functions exposed to window)
  - Imported as ES6 module in tests
- **Content scripts**: Load `content-utils.js` via background.js injection

### Testing

- Test files use ES6 modules with Jest
- Import actual production code (don't duplicate implementations)
- Use descriptive test names: `test('should parse display name with full name format', ...)`
- Group related tests with `describe()` blocks

## Questions or Issues?

- Check existing [Issues](../../issues)
- Create a new issue with:
  - Clear description of the problem
  - Steps to reproduce (for bugs)
  - Expected vs actual behavior
  - Browser version and OS

## Code of Conduct

- Be respectful and inclusive
- Provide constructive feedback
- Focus on the code, not the person
- Help others learn and grow

Thank you for contributing to GitHub Unveiler!
