# Integration Tests

This directory contains integration tests for the GitHub Unveiler Chrome extension using Selenium WebDriver.

## Overview

The integration tests verify that the Chrome extension:
- Loads successfully in a real Chrome browser
- Can navigate to GitHub pages without errors
- Has valid manifest and configuration files
- Does not crash or interfere with GitHub's functionality

## Prerequisites

- Node.js 18 or higher
- Chrome browser (automatically installed in GitHub Actions)

## Running Tests Locally

### Install Dependencies

```bash
npm install
```

### Run Integration Tests

```bash
# Run with headless Chrome (default)
npm run test:integration

# Run with visible browser (for debugging)
HEADLESS=false npm run test:integration
```

## Running Tests in GitHub Actions

The integration tests run automatically on:
- Push to `main`, `master`, or any `claude/**` branch
- Pull requests to `main` or `master`
- Manual workflow dispatch

View the workflow file: `.github/workflows/integration-test.yml`

## Test Coverage

The integration test suite includes:

1. **Extension Loading** - Verifies all required files exist and the extension loads
2. **Browser Navigation** - Tests navigation to GitHub with extension enabled
3. **Page Loading** - Ensures GitHub pages load correctly
4. **Extension Activation** - Verifies the extension doesn't crash
5. **DOM Accessibility** - Checks that GitHub page structure is accessible
6. **Manifest Validation** - Validates manifest.json structure
7. **Screenshot Capture** - Takes screenshots for debugging (local only)

## Important Notes

### Permission Requirements

The GitHub Unveiler extension uses Manifest V3's optional permissions model. This means:

- Users must **manually click the extension icon** to grant permissions for each domain
- Automated tests cannot automatically grant these permissions
- The test verifies the extension loads but cannot test the full replacement functionality without manual permission grant

This is a security feature of Chrome Extension Manifest V3 and is expected behavior.

### What the Tests Verify

✅ **Tests DO verify:**
- Extension files are valid and complete
- Extension loads without errors
- Chrome browser doesn't crash with extension installed
- Can navigate to GitHub with extension enabled
- Extension manifest is properly structured

❌ **Tests DO NOT verify:**
- Actual username-to-displayname replacement (requires permissions)
- GitHub API calls (requires permissions)
- Full end-to-end functionality (requires user interaction)

For comprehensive functionality testing, see the Jest unit tests in `/test/*.test.js`

## Troubleshooting

### Chrome Not Found

If you see "ChromeDriver could not be found":

```bash
npm install chromedriver --save-dev
```

### Permission Errors

If tests fail with permission errors in CI:
- Check that Chrome is installed correctly
- Verify the extension path is correct
- Ensure all required files exist

### Screenshots

On test failure, screenshots are automatically captured to:
- Local: `test/integration/error-screenshot.png`
- GitHub Actions: Uploaded as artifacts (retention: 7 days)

## Future Enhancements

Potential improvements for integration testing:

1. **Automated Permission Grant** - Explore Chrome options to pre-grant permissions
2. **Visual Regression Testing** - Compare screenshots before/after extension activation
3. **Network Interception** - Mock GitHub API responses for controlled testing
4. **Multi-Browser Testing** - Test on Firefox, Edge, etc.
5. **Performance Testing** - Measure extension impact on page load times

## Related Documentation

- [Main Test Suite](../README.md) - Jest unit tests
- [TESTING_REFACTOR_STRATEGY.md](../../TESTING_REFACTOR_STRATEGY.md) - Testing architecture
- [CONTRIBUTING.md](../../CONTRIBUTING.md) - Development guidelines
