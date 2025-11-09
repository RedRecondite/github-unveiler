# Coverage Gap Tasks

## Current Coverage Status

| File | Statements | Branches | Functions | Lines | Status |
|------|-----------|----------|-----------|-------|--------|
| background.js | 90% | 84.37% | 85% | 90% | ✅ Excellent |
| content-utils.js | 96.1% | 92.85% | 100% | 96% | ✅ Excellent |
| content.js | 19.69% | 10.46% | 33.33% | 20.44% | ⚠️ Improving |
| options.js | 42.48% | 31.54% | 55.17% | 42.47% | ✅ Good |
| **Overall** | **39.43%** | **32.21%** | **54.45%** | **40.08%** | ✅ **Meeting Thresholds** |

**Current Thresholds**: 39% statements, 32% branches, 54% functions, 40% lines
**Long-term Target**: 50%+ coverage across all metrics

**Progress Summary:**
- ✅ Refactored content.js to enable testing (+19.69% coverage)
- ✅ Created content.test-helper.js for ES6 module exports
- ✅ Updated content.extensioncontext.test.js to use real functions
- ✅ Overall coverage improved from 29.4% → 39.43% statements (+10%)
- ✅ Functions coverage improved from 39.6% → 54.45% (+15%)
- ✅ Now meeting all coverage thresholds

---

## Priority 1: content.js - PARTIALLY COMPLETE ✅

### File: content.js - Now at 19.69% coverage (was 0%)

**Major Achievement**: Refactored content.js to export functions on window object, enabling proper test coverage while maintaining browser compatibility.

#### Core Utility Functions - ✅ COMPLETED
- [x] `isExtensionContextValid()` (line 26) - Test extension context validation
- [x] `getCache()` (line 36) - Test cache retrieval from chrome.storage
- [x] `getSettings()` (line 59) - Test settings retrieval from chrome.storage

#### DOM Processing Functions
- [ ] `processBoardGroupHeader(root)` (line 83) - Test board group header processing
  - Test with valid header content blocks
  - Test with missing avatar count span
  - Test with invalid root element

- [ ] `processBlockedSectionMessages(root)` (line 220) - Test blocked section message processing
  - Test blocked user detection
  - Test username extraction from blocked messages

- [ ] `processMultiUserGridCell(root)` (line 294) - Test multi-user grid cell processing
  - Test avatar container detection
  - Test multiple user handling
  - Test edge cases with no avatars

- [ ] `processSingleUserGridCell(root)` (line 733) - Test single-user grid cell processing
  - Test single avatar detection
  - Test username extraction
  - Test text node updates

- [ ] `processProjectElements(root)` (line 828) - Test project element processing
  - Test project card detection
  - Test username extraction from projects

- [ ] `processAnchorsByHovercard(root)` (line 971) - Test anchor processing via hovercard
  - Test hovercard link detection
  - Test username extraction from data-hovercard-url

- [ ] `processHovercard(hovercardElement)` (line 583) - Test hovercard processing
  - Test display name extraction from hovercards
  - Test update of associated elements

#### Element Management
- [ ] `registerElement(username, updateCallback)` (line 408) - Test element registration
  - Test callback registration for username
  - Test multiple callbacks for same username

- [ ] `updateElements(username)` (line 418) - Test element updates
  - Test callback execution
  - Test handling of missing display names

- [ ] `processCollectedNodes()` (line 1060) - Test node collection processing
  - Test mutation observer integration
  - Test batch processing of nodes

#### Integration Tests for content.js
- [ ] Test MutationObserver setup and callbacks
- [ ] Test overall initialization flow
- [ ] Test interaction between different processing functions
- [ ] Test error handling when chrome APIs are unavailable
- [ ] Test behavior when extension context is invalidated

---

## Priority 2: Important - options.js (42.48% coverage)

### File: options.js

**Uncovered lines**: 8-14, 24-26, 31-32, 39-40, 46-51, 59-77, 88, 94-95, 102-108, 113-118, 137, 181, 193-225, 231, 238-240, 254, 263, 270-294, 305-310, 321-389, 396, 401, 406

#### Functions Needing More Coverage

- [ ] `handleHashScroll()` (line 6) - Test hash-based scrolling
  - Test with valid hash
  - Test with invalid hash
  - Test highlight animation

- [ ] `saveCache(cache, callback)` (line 20) - Test cache saving error paths
  - Test chrome.runtime.lastError handling (lines 24-26)
  - Test missing storage API (lines 31-32)

- [ ] `loadEnabledDomains()` (line 36) - Test domain loading edge cases
  - Test missing DOM element (lines 39-40)
  - Test chrome.runtime.lastError (lines 46-51)
  - Test various origin scenarios (lines 59-77)

- [ ] `updateExpirationDateCell()` (line 81) - Test all branches
  - Already well tested but verify all paths

- [ ] `loadNameReplacements()` (line 92) - Test name replacement loading
  - Test missing DOM element (lines 94-95)
  - Test chrome.runtime.lastError (lines 102-108)
  - Test cache entry rendering (lines 113-118)
  - Test empty cache scenario (line 137)

- [ ] Cache management event handlers - Test user interactions
  - Clear expired entries functionality (lines 193-225)
  - Clear all entries functionality (lines 238-240)
  - Export cache functionality (lines 270-294)
  - Import cache functionality (lines 305-310)

- [ ] Settings management - Test settings UI
  - Display format dropdown changes (lines 321-389)
  - Settings save/load functionality
  - Default settings initialization

---

## Priority 3: Polish - background.js (90% coverage)

### File: background.js

**Uncovered lines**: 43, 66-67, 98, 149-150, 154-156, 192

These are mostly edge cases and error paths:

- [ ] Test error handling in cache operations (lines 66-67)
- [ ] Test edge cases in injectContentScript (lines 149-150, 154-156)
- [ ] Test updateCache error path (line 192)
- [ ] Test clearOldCacheEntries with various date scenarios (line 43)
- [ ] Verify error handling in all async operations (line 98)

---

## Priority 4: Maintain - content-utils.js (96.1% coverage)

### File: content-utils.js

**Uncovered lines**: 82, 88, 171

These are minor gaps in an otherwise well-tested file:

- [ ] Test edge case on line 82 in `isBotUsername()`
- [ ] Test edge case on line 88 in `isBotUsername()`
- [ ] Test edge case on line 171 in `parseDisplayNameFormat()`

---

## Coverage Improvement Strategy

### Phase 1: Get to 30% (Focus on high-impact, easy tests)
1. Add basic tests for content.js core utilities (isExtensionContextValid, getCache, getSettings)
2. Add tests for options.js main UI functions
3. This should bring overall coverage to ~30-35%

### Phase 2: Get to 50% (Target threshold)
1. Add tests for content.js DOM processing functions (processBoardGroupHeader, processBlockedSectionMessages)
2. Add comprehensive tests for options.js cache management
3. Add tests for content.js element management
4. This should bring overall coverage to 50%+

### Phase 3: Get to 70%+ (Comprehensive coverage)
1. Add integration tests for content.js
2. Add all remaining edge cases for options.js
3. Complete background.js edge cases
4. Add end-to-end tests for user workflows

---

## Notes

- **Do not resolve these gaps yet** - This is a task list only
- Priority should be given to content.js as it's the largest and most critical file
- Tests should mock chrome.* APIs appropriately
- Consider adding integration tests that test multiple components together
- Update coverage thresholds in package.json as coverage improves

---

## Commands

Run coverage report:
```bash
npm run test:coverage
```

Run tests in watch mode:
```bash
npm test -- --watch
```

View HTML coverage report:
```bash
open coverage/lcov-report/index.html
```
