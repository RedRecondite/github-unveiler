/**
 * Test helper for importing content-utils.js functions
 *
 * This file provides ES6 exports for testing while keeping content-utils.js
 * as a plain script (no export statements) so it can be loaded by Chrome
 * extensions via chrome.scripting.executeScript.
 *
 * Tests should import from this file instead of content-utils.js directly.
 */

// Import the script (this will run it and populate window)
import '../content-utils.js';

// Re-export functions from window for test imports
export const PROCESSED_MARKER = window.PROCESSED_MARKER;
export const HOVERCARD_PROCESSED_MARKER = window.HOVERCARD_PROCESSED_MARKER;
export const isValidUsername = window.isValidUsername;
export const KNOWN_BOT_PATTERNS = window.KNOWN_BOT_PATTERNS;
export const isBotUsername = window.isBotUsername;
export const parseDisplayNameFormat = window.parseDisplayNameFormat;
export const getUsername = window.getUsername;
export const updateTextNodes = window.updateTextNodes;
