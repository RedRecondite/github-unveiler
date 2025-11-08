/**
 * Utility functions for GitHub Unveiler content script
 * These functions are extracted from content.js to enable proper unit testing
 * while maintaining functionality in the browser extension context.
 *
 * This file works in both ES6 module context (for tests) and as a browser script
 * (for the Chrome extension).
 *
 * When loaded as a browser script (via chrome.scripting.executeScript), functions
 * are made available on the window object.
 * When loaded as an ES6 module (in tests), functions are exported.
 */

// Wrap in IIFE to prevent duplicate declarations on multiple injections
(function() {
  /**
   * Marker attribute for processed elements
   */
  const PROCESSED_MARKER = "data-ghu-processed";
  const HOVERCARD_PROCESSED_MARKER = "data-ghu-hovercard-processed";

  /**
   * Checks if a given string is a valid GitHub username.
   * - Between 1 and 39 characters long.
   * - Consists of alphanumeric characters and single hyphens.
   * - Cannot start or end with a hyphen.
   * - Cannot contain consecutive hyphens.
   * @param {string} username The string to validate.
   * @returns {boolean} True if valid, false otherwise.
   */
  function isValidUsername(username) {
    if (!username) {
      return false;
    }
    // GitHub username constraints:
    // - Length: 1 to 39 characters
    // - Allowed characters: Alphanumeric and single hyphens
    // - Cannot start or end with a hyphen
    // - Cannot contain consecutive hyphens
    const githubUsernameRegex = /^[a-z\d_](?:[a-z\d_]|-(?=[a-z\d_])){0,38}$/i;
    if (username.length > 39) { // Double check length, though regex implies it.
        return false;
    }
    return githubUsernameRegex.test(username);
  }

  /**
   * Known bot patterns for identifying automated accounts
   */
  const KNOWN_BOT_PATTERNS = [
    "bot", // General catch-all, especially for "[bot]" suffix
    "copilot", // Specific name
    "dependabot",
    "github-actions",
    "renovate",
    "snyk-bot",
    "codecov-commenter",
    "greenkeeper",
    "netlify",
    "vercel",
    // Add more known bot usernames or patterns as needed
  ];

  /**
   * Checks if a username belongs to a known bot account
   * @param {string} username The username to check
   * @returns {boolean} True if the username matches known bot patterns
   */
  function isBotUsername(username) {
    if (!username) return false;
    const lowerUsername = username.toLowerCase();

    // Check against known patterns
    for (const pattern of KNOWN_BOT_PATTERNS) {
      if (lowerUsername.includes(pattern)) {
        // More specific check for "[bot]" or "-bot" suffixes or exact matches
        if (lowerUsername === pattern || lowerUsername.endsWith(`[${pattern}]`) || lowerUsername.endsWith(`-${pattern}`) || lowerUsername.startsWith(`${pattern}-`)) {
          return true;
        }
        // If pattern is just "bot", check for common bot suffixes
        if (pattern === "bot" && (lowerUsername.endsWith("[bot]") || lowerUsername.endsWith("-bot"))) {
          return true;
        }
      }
    }
    // Check for common bot indicators
    if (lowerUsername.endsWith("[bot]") || lowerUsername.endsWith("-bot") || lowerUsername.startsWith("bot-")) {
        return true;
    }

    return false;
  }

  /**
   * Parses display names in the format "LastName, FirstName (Something)"
   * and rewrites them as "FirstName LastName" if enabled.
   * Only performs replacement if the display name has exactly one comma,
   * one open-parenthesis, and one close-parenthesis.
   *
   * @param {string} displayName The display name to parse
   * @param {boolean} enabled Whether the parsing is enabled
   * @returns {string} The parsed display name or original if parsing is disabled or format doesn't match
   */
  function parseDisplayNameFormat(displayName, enabled) {
    if (!enabled || !displayName) {
      return displayName;
    }

    // Count occurrences of comma, open-paren, and close-paren
    const commaCount = (displayName.match(/,/g) || []).length;
    const openParenCount = (displayName.match(/\(/g) || []).length;
    const closeParenCount = (displayName.match(/\)/g) || []).length;

    // Only proceed if exactly one of each
    if (commaCount !== 1 || openParenCount !== 1 || closeParenCount !== 1) {
      return displayName;
    }

    // Match the pattern: "LastName, FirstName (Something)"
    // This regex captures:
    // - Group 1: LastName (can include spaces)
    // - Group 2: FirstName (can include spaces)
    // - Group 3: Content in parentheses (optional capture for validation)
    const pattern = /^([^,]+),\s*([^(]+)\s*\([^)]+\)\s*$/;
    const match = displayName.match(pattern);

    if (match) {
      const lastName = match[1].trim();
      const firstName = match[2].trim();
      return `${firstName} ${lastName}`;
    }

    return displayName;
  }

  /**
   * Get the username from an anchor tag, preferring the data-hovercard-url to the href.
   * @param {HTMLAnchorElement} anchor The anchor element to extract username from
   * @returns {string|null} The username if found and valid, null otherwise
   */
  function getUsername(anchor) {
    let usernameStr = null;
    const hover = anchor.getAttribute("data-hovercard-url");
    const href = anchor.getAttribute("href");

    if (hover) {
      // Regex to capture username from /users/USERNAME(/...) or /users/USERNAME?....
      // Ensures username part is captured before any subsequent path or query.
      // Uses same pattern as isValidUsername to prevent backtracking and enforce GitHub username rules
      const match = hover.match(/^\/users\/([a-zA-Z0-9_](?:[a-zA-Z0-9_]|-(?=[a-zA-Z0-9_])){0,38})(?:[\/?#]|$)/);
      if (match) usernameStr = match[1];
    }

    if (!usernameStr && href) {
      // Matches /username, /username/, /username?query, /username#hash
      // Also matches /username/issues, /username/issues/, etc.
      // Uses same pattern as isValidUsername to prevent backtracking and enforce GitHub username rules
      const usernameRegex = /^\/([a-zA-Z0-9_](?:[a-zA-Z0-9_]|-(?=[a-zA-Z0-9_])){0,38})(?:(?:\/)?(?:$|\?|#)|(?:\/(?:issues|pulls|projects|commits)(?:\/)?)?(?:$|\?|#))/;
      const match = href.match(usernameRegex);
      const blacklist = /^(orgs|sponsors|marketplace|topics|collections|explore|trending|events|codespaces|settings|notifications|logout|features|pricing|readme|about|contact|site|security|open-source|customer-stories|team|enterprise|careers|blog|search|new|import|organizations|dashboard|stars|watching|profile|account|gist|integrations|apps|developer|sitemap|robots\.txt|humans\.txt|favicon\.ico|apple-touch-icon\.png|manifest\.json|login|join|session|sessions|auth|api|graphql|raw|blob|tree|releases|wiki|pulse|graphs|network|community|actions|packages|discussions|sponsors)$/i;
      if (match && match[1] && !blacklist.test(match[1])) {
        usernameStr = match[1];
      }
    }

    if (usernameStr && isValidUsername(usernameStr)) {
      // Explicitly exclude names that look like bot indicators from the URL itself,
      // though isValidUsername should handle most structural issues.
      // The main bot list check is in fetchDisplayName.
      if (usernameStr.toLowerCase().includes("[bot]")) { // This was in old regex, good to keep a check here too.
        return null;
      }
      return usernameStr;
    }
    return null; // Return null if not valid or not found
  }

  /**
   * Updates text nodes within an element, replacing username mentions with display names.
   * Handles both @username and plain username formats.
   * This function is idempotent - it won't re-replace text that already contains the display name.
   *
   * @param {HTMLElement} element The element to search for text nodes
   * @param {string} username The username to find and replace
   * @param {string} name The display name to replace with
   * @returns {boolean} True if any text was changed, false otherwise
   */
  function updateTextNodes(element, username, name) {
    // Escape special regex chars in the username
    const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match standalone @username or username (doesn't run inside other words)
    const regex = new RegExp(`(?<!\\w)@?${escapedUsername}(?!\\w)`, "g");

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );
    let node;
    let changed = false;
    while ((node = walker.nextNode())) {
      // If we've already inserted the full name here, skip it
      if (node.textContent.includes(name)) {
        // If the display name is already present, we assume it's fully correct.
        // This is simpler and might be more robust for cases like TBBle.
        // However, this means if a username token still exists that *should* be replaced,
        // and the displayName is also part of another text node, it might be skipped.
        // The PROCESSED_MARKER should ideally prevent re-entry for the whole element.
        // This change makes updateTextNodes itself more idempotent if called multiple times
        // on the same text that already contains the final display name.
        continue;
      }

      const updated = node.textContent.replace(regex, (match) =>
        match.startsWith("@") ? `@${name}` : name
      );
      if (updated !== node.textContent) {
        node.textContent = updated;
        changed = true;
      }
    }
    return changed;
  }

  // ==============================================================================
  // Make functions available globally for browser context
  // ==============================================================================
  // When this file is injected via chrome.scripting.executeScript, all functions
  // and constants are made available on the window object for use by content.js

  // Guard against multiple injections - only set window properties once
  if (typeof window !== 'undefined' && !window.PROCESSED_MARKER) {
    window.PROCESSED_MARKER = PROCESSED_MARKER;
    window.HOVERCARD_PROCESSED_MARKER = HOVERCARD_PROCESSED_MARKER;
    window.isValidUsername = isValidUsername;
    window.KNOWN_BOT_PATTERNS = KNOWN_BOT_PATTERNS;
    window.isBotUsername = isBotUsername;
    window.parseDisplayNameFormat = parseDisplayNameFormat;
    window.getUsername = getUsername;
    window.updateTextNodes = updateTextNodes;
    console.log("content-utils.js loaded and functions exposed to window");
  }
})();
