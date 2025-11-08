# Unit Test Refactoring Strategy

## Problem Statement

The unit tests in this project were following a terrible practice: **copying implementation code into the test files**. This meant:

- Tests were not testing the actual production code
- Implementation changes weren't reflected in tests
- Tests could pass even if production code was broken
- Maintenance burden from code duplication
- Tests had diverged from the real implementation (e.g., different username validation regex)

## Solution Overview

We refactored the tests to properly import and test the actual production code by:

1. **Extracting utility functions** into a separate ES6 module (`content-utils.js`)
2. **Configuring the Chrome extension** to load the utility module before the main content script
3. **Configuring Jest** to support ES6 modules for testing
4. **Refactoring test files** to import and test the real code

## Implementation Details

### 1. Created `content-utils.js` Module

**Location:** `/content-utils.js`

**Purpose:** Centralized location for utility functions that need to be:
- Used by the content script in the browser
- Tested independently in the test suite

**Exported Functions:**
- `isValidUsername(username)` - Validates GitHub usernames
- `isBotUsername(username)` - Identifies bot accounts
- `parseDisplayNameFormat(displayName, enabled)` - Parses and reformats display names
- `getUsername(anchor)` - Extracts usernames from anchor elements
- `KNOWN_BOT_PATTERNS` - Array of known bot patterns

**Key Design Decision:**
The file uses ES6 export syntax, making it work as:
- An ES6 module for Jest tests (imports work)
- A browser script for the Chrome extension (loaded before content.js)

### 2. Updated Chrome Extension Loading

**File Modified:** `background.js`

**Change:** Modified `injectContentScript()` to load both files:

```javascript
function injectContentScript(tabId) {
  // Inject content-utils.js first to make utility functions available
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ["content-utils.js", "content.js"]
  }, () => {
    // error handling...
  });
}
```

**Why:** Chrome extension scripts loaded in order share a global scope. By loading `content-utils.js` first, its exported functions become available to `content.js`.

### 3. Updated `content.js`

**Changes Made:**
- Removed duplicate function implementations
- Added comments indicating functions are from `content-utils.js`
- Functions are accessed as globals in the browser context

**Before:**
```javascript
(() => {
  function isValidUsername(username) {
    // implementation...
  }
  // ... rest of code
})();
```

**After:**
```javascript
// Utility functions are loaded from content-utils.js which must be injected first
// In the browser context, they are available as global functions
// In the test context, they are imported as ES6 modules

(() => {
  // isValidUsername is imported from content-utils.js
  // ... rest of code uses isValidUsername, isBotUsername, etc.
})();
```

### 4. Configured Jest for ES6 Modules

**File Modified:** `package.json`

**Changes:**
```json
{
  "type": "module",
  "jest": {
    "testEnvironment": "jest-environment-jsdom",
    "transform": {}
  },
  "scripts": {
    "test": "NODE_OPTIONS=--experimental-vm-modules jest"
  }
}
```

**Why:**
- `"type": "module"` - Tells Node.js to treat `.js` files as ES6 modules
- `"transform": {}` - Disables default transformations, using native ES6
- `NODE_OPTIONS=--experimental-vm-modules` - Enables ES6 module support in Jest

### 5. Refactored Test File Examples

#### Example 1: `test/content.utility.test.js`

**Before (BAD - 257 lines):**
```javascript
// Duplicated from content.js for testing purposes
function isValidUsername(username) {
  // ... duplicated implementation
}

describe('isValidUsername', () => {
  test('should return true for valid usernames', () => {
    expect(isValidUsername('test')).toBe(true);
  });
});
```

**After (GOOD - 205 lines):**
```javascript
// REFACTORED TEST FILE
// This test file now imports and tests the ACTUAL code from content-utils.js
import { isValidUsername, isBotUsername, getUsername, KNOWN_BOT_PATTERNS } from '../content-utils.js';

describe('isValidUsername', () => {
  test('should return true for valid usernames', () => {
    expect(isValidUsername('test')).toBe(true);
  });
});
```

#### Example 2: `test/content.displayname.test.js`

**Before (BAD - 147 lines):**
```javascript
// Duplicated from content.js for testing purposes
function parseDisplayNameFormat(displayName, enabled) {
  // ... duplicated implementation (30+ lines)
}

describe('parseDisplayNameFormat', () => {
  // ... tests
});
```

**After (GOOD - 120 lines):**
```javascript
// REFACTORED TEST FILE
// This test file now imports and tests the ACTUAL code from content-utils.js
import { parseDisplayNameFormat } from '../content-utils.js';

describe('parseDisplayNameFormat', () => {
  // ... same tests, now testing real code!
});
```

## Benefits Achieved

### ✅ Single Source of Truth
- Production code and tests use the same implementation
- Changes to production code are immediately reflected in tests

### ✅ Real Bug Detection
- The refactoring revealed that the duplicated test code had diverged from production
- Example: Tests expected underscores to be invalid, but production code correctly allowed them per GitHub's rules

### ✅ Reduced Code Duplication
- `content.utility.test.js`: 257 lines → 205 lines (-20%)
- `content.displayname.test.js`: 147 lines → 120 lines (-18%)
- **Total: 2 test files refactored, 52 tests now testing real production code**
- More importantly: 0 duplicated implementation code

### ✅ Better Maintainability
- Update implementation once, tests automatically validate the change
- No risk of test code and production code diverging

## How to Apply This Pattern to Other Test Files

### Step 1: Identify Functions to Extract

Look for duplicated functions at the top of test files:

```javascript
// test/content.displayname.test.js
// Duplicated from content.js for testing purposes  ← RED FLAG!
function parseDisplayNameFormat(displayName, enabled) {
  // ...
}
```

### Step 2: Check if Function Already Exists in content-utils.js

- If YES: Skip to Step 4
- If NO: Add it to `content-utils.js` with proper export

### Step 3: Add to content-utils.js (if needed)

```javascript
// content-utils.js
export function yourFunctionName(params) {
  // Move implementation from content.js here
  return result;
}
```

Then update `content.js` to remove the implementation and add a comment:

```javascript
// content.js
(() => {
  // yourFunctionName is imported from content-utils.js

  // ... use yourFunctionName() as normal
})();
```

### Step 4: Refactor the Test File

**Remove** duplicated implementation:
```javascript
// DELETE THIS:
// Duplicated from content.js for testing purposes
function yourFunctionName(params) {
  // ...
}
```

**Add** import statement at the top:
```javascript
// ADD THIS:
import { yourFunctionName } from '../content-utils.js';
```

### Step 5: Run Tests and Fix Issues

```bash
npm test -- test/your-test-file.test.js
```

Common issues:
- **Test expectations don't match reality**: Update tests to match actual behavior
- **Missing exports**: Add to `content-utils.js` exports
- **Import path wrong**: Verify relative path from test file to `content-utils.js`

## Test Files Ready for Refactoring

### ✅ Already Refactored
- `test/content.utility.test.js` - **DONE** ✓ (31 tests passing)
- `test/content.displayname.test.js` - **DONE** ✓ (21 tests passing)

### 🔄 Ready to Refactor

1. **Other test files** (12 remaining)
   - These use CommonJS/global Jest syntax and need ES6 migration
   - May also have duplicated implementations to extract
   - Follow the steps above
   - Files: `content.anchor.test.js`, `content.boardgroupheader.test.js`, `content.blockedsection.test.js`, `content.grid.*.test.js`, `content.hovercard.test.js`, `content.idempotency.test.js`, `content.mutation.test.js`, `content.projects.test.js`, `content.statuskeywords.test.js`, `background.test.js`, `options.test.js`

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- test/content.utility.test.js

# Run with coverage
npm test -- --coverage

# Watch mode during development
npm test -- --watch
```

## Validation Checklist

After refactoring a test file:

- [ ] No duplicated function implementations in test file
- [ ] All functions imported from `content-utils.js`
- [ ] All tests pass
- [ ] Test file has clear comment explaining it tests real code
- [ ] Functions removed from content.js with comment indicating they're in content-utils.js
- [ ] Chrome extension still works (utility functions available in browser)

## Important Notes

### Browser vs Test Context

**In Browser (Chrome Extension):**
- Both `content-utils.js` and `content.js` are loaded as regular scripts
- They share a global scope
- Exported functions become global variables
- No `import` statements needed in `content.js`

**In Tests (Jest):**
- ES6 modules with proper imports
- Each test file imports what it needs from `content-utils.js`
- Clean, isolated test environment

### Why This Works

The beauty of this approach is that the same `content-utils.js` file works in both contexts:

1. **As a browser script**: Export statements are ignored in global scope, but functions are defined globally
2. **As an ES6 module**: Export statements properly expose functions to test files

## Future Improvements

1. **TypeScript**: Consider adding TypeScript for better type safety
2. **Module Bundler**: Use a bundler (webpack/rollup) for more sophisticated module management
3. **More Test Coverage**: Now that testing is easier, add more comprehensive tests
4. **Integration Tests**: Test content.js functions that depend on utilities

## Conclusion

This refactoring establishes a sustainable testing pattern where:
- Tests verify actual production code
- Code duplication is eliminated
- Future development is easier and safer
- Bugs are caught before they reach users

The pattern demonstrated with `content.utility.test.js` should be applied to all remaining test files in the project.
