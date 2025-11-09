/**
 * Test helper for importing content.js functions
 *
 * This file provides ES6 exports for testing while keeping content.js
 * as a plain script (no export statements) so it can be loaded by Chrome
 * extensions via chrome.scripting.executeScript.
 *
 * Tests should import from this file instead of content.js directly.
 */

// Import content-utils.js first (content.js depends on it)
import './content-utils.test-helper.js';

// Import the script (this will run it and populate window)
import '../content.js';

// Re-export functions from window for test imports
export const isExtensionContextValid = window.isExtensionContextValid;
export const getCache = window.getCache;
export const getSettings = window.getSettings;
export const processBoardGroupHeader = window.processBoardGroupHeader;
export const processBlockedSectionMessages = window.processBlockedSectionMessages;
export const processMultiUserGridCell = window.processMultiUserGridCell;
export const processSingleUserGridCell = window.processSingleUserGridCell;
export const processProjectElements = window.processProjectElements;
export const processAnchorsByHovercard = window.processAnchorsByHovercard;
export const processHovercard = window.processHovercard;
export const registerElement = window.registerElement;
export const updateElements = window.updateElements;
export const fetchDisplayName = window.fetchDisplayName;
export const processCollectedNodes = window.processCollectedNodes;
export const loadSkipDebounceSetting = window.loadSkipDebounceSetting;
