// Utility functions are loaded from content-utils.js which must be injected first
// In the browser context, they are available as global functions
// In the test context, they are imported as ES6 modules

(() => {
  // ------------------------------
  // Global Variables & Cache Setup
  // ------------------------------

  // ------------------------------
  // Utility Functions
  // ------------------------------
  // Note: Core utility functions are imported from content-utils.js for better testability

  // ------------------------------
  // Global Variables & Cache Setup
  // ------------------------------
  // Use PROCESSED_MARKER from window (set by content-utils.js)
  const PROCESSED_MARKER = window.PROCESSED_MARKER;
  const CACHE_KEY = "githubDisplayNameCache";
  const SETTINGS_KEY = "githubUnveilerSettings";
  const displayNames = {}; // username => fetched display name
  const elementsByUsername = {}; // username => array of update callbacks
  let cachedSettings = {}; // Cache settings in memory for instant access

  // Helper: Check if the extension context is valid
  function isExtensionContextValid() {
    try {
      // chrome.runtime.id becomes undefined when extension context is invalidated
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  // Helper: Get the cache from chrome.storage.local.
  function getCache() {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) {
        resolve({});
        return;
      }
      try {
        chrome.storage.local.get([CACHE_KEY], (result) => {
          if (chrome.runtime.lastError) {
            console.warn('Chrome storage error:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(result[CACHE_KEY] || {});
          }
        });
      } catch (e) {
        console.warn('Extension context invalidated in getCache:', e.message);
        resolve({});
      }
    });
  }

  // Helper: Get the settings from chrome.storage.local.
  function getSettings() {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) {
        resolve({});
        return;
      }
      try {
        chrome.storage.local.get([SETTINGS_KEY], (result) => {
          if (chrome.runtime.lastError) {
            console.warn('Chrome storage error:', chrome.runtime.lastError);
            resolve({});
          } else {
            resolve(result[SETTINGS_KEY] || {});
          }
        });
      } catch (e) {
        console.warn('Extension context invalidated in getSettings:', e.message);
        resolve({});
      }
    });
  }

  // parseDisplayNameFormat is imported from content-utils.js

  function processBoardGroupHeader(root) {
    if (!(root instanceof Element)) return;

    // Find potential "header content blocks". This selector looks for a div that directly contains
    // a span with data-avatar-count, which itself contains the avatar image,
    // and that span is immediately followed by another span (expected to be the username text).
    const headerContentBlocks = root.querySelectorAll(
      "div > span[data-avatar-count] + span"
    );

    headerContentBlocks.forEach((usernameTextSpan) => {
      const avatarCountSpan = usernameTextSpan.previousElementSibling; // This is the span[data-avatar-count]
      if (
        !avatarCountSpan ||
        !avatarCountSpan.hasAttribute("data-avatar-count")
      )
        return;

      const avatarImg = avatarCountSpan.querySelector(
        'img[data-testid="github-avatar"]'
      );
      if (!avatarImg) return;

      // The "header content block" is likely the parent of avatarCountSpan and usernameTextSpan
      const headerContentBlock = avatarCountSpan.parentElement;
      if (!headerContentBlock || headerContentBlock.tagName !== "DIV") return;

      // Determine the main container to mark as processed.
      // This might be the headerContentBlock itself, or a specific parent.
      // For project boards, it's often a few levels up, e.g., div.board-view-group-header or similar.
      // Let's try to find a parent that looks like a group container.
      // A common structure is <div class="board-view-group"> -> <div class="board-view-group-header"> -> <div class="board-view-group-header-content">
      // We are starting from headerContentBlock, trying to find board-view-group-header or similar.
      // For now, let's assume the headerContentBlock's parent is a good candidate for the PROCESSED_MARKER.
      // This might need refinement based on actual DOM.
      const groupHeaderContainer = headerContentBlock.parentElement;
      if (
        !groupHeaderContainer ||
        groupHeaderContainer.hasAttribute(PROCESSED_MARKER)
      ) {
        // If no suitable parent or already processed, skip.
        // If groupHeaderContainer is null, it means headerContentBlock has no parent, which is unlikely for valid elements.
        // If it IS processed, we skip. If it's the headerContentBlock itself we want to mark, adjust accordingly.
        // For safety, if there's no clear parent to mark, we could mark headerContentBlock.
        // However, the instruction implies a "main group header container".
        if (headerContentBlock.hasAttribute(PROCESSED_MARKER)) return; // Check headerContentBlock if parent logic is too broad
        // If no distinct groupHeaderContainer identified to mark, consider not processing or logging.
        // For now, if groupHeaderContainer is invalid, we will skip by processing headerContentBlock directly and marking it.
        if (!groupHeaderContainer) {
          // If headerContentBlock has no parent
          if (headerContentBlock.hasAttribute(PROCESSED_MARKER)) return;
          // proceed with headerContentBlock as the item to mark
        } else if (groupHeaderContainer.hasAttribute(PROCESSED_MARKER)) {
          return; // Already processed the designated container
        }
      }

      const potentialUsername = avatarImg.alt
        ? avatarImg.alt.replace("@", "").trim()
        : null;

      if (!isValidUsername(potentialUsername)) {
        // Mark as processed if the alt text is not a valid username to avoid reprocessing.
        // This helps with the case where alt text is something like a commit message.
        const containerToMark = groupHeaderContainer || headerContentBlock;
        // Ensure we don't mark null or undefined containers
        if (containerToMark && !containerToMark.hasAttribute(PROCESSED_MARKER)) {
            containerToMark.setAttribute(PROCESSED_MARKER, "true");
        }
        return;
      }
      const username = potentialUsername;

      // Identify tooltip spans. These are often siblings to the headerContentBlock or its parent (groupHeaderContainer).
      const tooltipSpans = [];
      const searchContextForTooltips =
        groupHeaderContainer || headerContentBlock; // Prefer parent if available

      if (searchContextForTooltips.parentElement) {
        const potentialTooltips = Array.from(
          searchContextForTooltips.parentElement.querySelectorAll(
            'span[popover="auto"]'
          )
        );
        potentialTooltips.forEach((tip) => {
          const text = tip.textContent.toLowerCase();
          // More specific checks for tooltip content to associate them correctly
          // Ensure the tooltip text not only contains the username but is also relevant to the group.
          if (
            (text.startsWith("collapse group") ||
              text.startsWith("actions for group")) &&
            text.includes(username.toLowerCase())
          ) {
            tooltipSpans.push(tip);
          }
        });
      }

      const processUpdate = (userData) => { // Changed parameter name
        if (avatarImg.alt !== `@${userData}`) {
          avatarImg.alt = `@${userData}`;
        }
        updateTextNodes(usernameTextSpan, username, userData);

        tooltipSpans.forEach((tooltipSpan) => {
          // Replace username in tooltip text. Be careful with case sensitivity if needed.
          // Using a regex for replacement is safer.
          const escapedUsername = username.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          );
          const regex = new RegExp(escapedUsername, "gi"); // 'g' for global, 'i' for case-insensitive

          // Only update if the username is actually found (avoids issues if structure changes)
          if (tooltipSpan.textContent.match(regex)) {
            tooltipSpan.textContent = tooltipSpan.textContent.replace(
              regex,
              userData
            );
          }
        });

        // Mark as processed
        const containerToMark = groupHeaderContainer || headerContentBlock;
        containerToMark.setAttribute(PROCESSED_MARKER, "true");
      };

      if (displayNames[username]) {
        processUpdate(displayNames[username]);
      } else {
        registerElement(username, processUpdate);
        fetchDisplayName(username);
      }
    });
  }

  // Process blocked merge section to replace usernames with display names
  async function processBlockedSectionMessages(root) { // now uses cache only, no direct refetch
    if (!(root instanceof Element)) return;

    // Check feature flag first
    const settings = await getSettings();
    if (!settings.replaceCodeOwnerMergingIsBlocked) {
      return;
    }

    const section = root.matches('[aria-label="Merging is blocked"]')
      ? root
      : root.querySelector('[aria-label="Merging is blocked"]');
    if (!section) return;

    const msgEl = section.querySelector('[class*="BlockedSectionMessage"]');
    if (!msgEl || msgEl.hasAttribute(PROCESSED_MARKER)) return;

    const LEADING_PHRASE = 'Waiting on code owner review from';
    const originalText = msgEl.textContent || '';
    const hasLeadingPhrase = originalText.startsWith(LEADING_PHRASE);

    let serverCache = {};
    try {
      const cache = await getCache();
      serverCache = cache[location.hostname] || {};
    } catch (e) {
      // ignore cache errors
    }

    // If the element does not start with the phrase, do not attempt to rebuild;
    // just mark processed to avoid accidental phrase loss.
    if (!hasLeadingPhrase) {
      msgEl.setAttribute(PROCESSED_MARKER, 'true');
      return;
    }

    // Remainder after the leading phrase (may contain usernames or already display names)
    const remainder = originalText.slice(LEADING_PHRASE.length);

    // Collect candidate tokens (usernames) from the remainder.
    const tokenRegex = /@?[A-Za-z\d_](?:[A-Za-z\d_]|-(?=[A-Za-z\d_])){0,38}/g;
    const tokens = remainder.match(tokenRegex) || [];

    const seen = new Set();
    const resolvedNames = [];

    tokens.forEach(tok => {
      const candidate = tok.startsWith('@') ? tok.slice(1) : tok;
      // Prefer cache/displayNames only (no re-fetching).
      const display =
        displayNames[candidate] ||
        (serverCache[candidate] && parseDisplayNameFormat(serverCache[candidate].displayName, settings.parseDisplayNameFormat));
      if (display) {
        // Strip any accidental leading phrase prefix inside cached display
        const cleanDisplay = display.startsWith(LEADING_PHRASE)
          ? display.slice(LEADING_PHRASE.length).trim()
          : display.trim();
        if (!seen.has(candidate)) {
          seen.add(candidate);
          resolvedNames.push(cleanDisplay);
        }
      }
    });

    // Mark processed even if we didn't replace any names, to prevent checking this node over-and-over.
    msgEl.setAttribute(PROCESSED_MARKER, 'true');

    // If we resolved at least one name, rebuild the message
    // Otherwise leave the original untouched
    if (resolvedNames.length > 0) {
      msgEl.textContent = LEADING_PHRASE + ':  ' + resolvedNames.join(' - ');
    } else return;
  }

  function processMultiUserGridCell(root) {
    if (!(root instanceof Element)) return;

    let cellsToProcess = [];
    if (root.matches('div[role="gridcell"]')) {
      cellsToProcess.push(root);
    }
    cellsToProcess.push(
      ...Array.from(root.querySelectorAll('div[role="gridcell"]'))
    );
    const uniqueCells = Array.from(new Set(cellsToProcess));

    uniqueCells.forEach((cell) => {
      if (cell.hasAttribute(PROCESSED_MARKER)) {
        return;
      }

      const multiUserSpan = cell.querySelector("span[data-avatar-count]");
      if (!multiUserSpan) {
        return;
      }

      const avatarImgs = Array.from(
        multiUserSpan.querySelectorAll('img[data-testid="github-avatar"]')
      );
      if (avatarImgs.length === 0) {
        return;
      }

      // Try to find the sibling span that contains the list of usernames.
      // This can be tricky. A common pattern is that it's an immediate sibling.
      let usernamesTextSpan = multiUserSpan.nextElementSibling;
      if (!usernamesTextSpan || usernamesTextSpan.tagName !== "SPAN") {
        // Fallback: sometimes it might be wrapped in another element, or not be an immediate sibling.
        // This is a simple heuristic; more complex DOM structures might need more robust selectors.
        const parent = multiUserSpan.parentElement;
        if (parent) {
          // Look for a span sibling of the parent of multiUserSpan, common in some layouts
          let potentialSpan = parent.nextElementSibling;
          if (potentialSpan && potentialSpan.tagName === "SPAN") {
            usernamesTextSpan = potentialSpan;
          } else {
            // Or look for a span among the siblings of multiUserSpan itself more broadly
            let currentSibling = multiUserSpan.nextElementSibling;
            while (currentSibling) {
              if (
                currentSibling.tagName === "SPAN" &&
                !currentSibling.hasAttribute("data-avatar-count")
              ) {
                usernamesTextSpan = currentSibling;
                break;
              }
              currentSibling = currentSibling.nextElementSibling;
            }
          }
        }
      }

      if (!usernamesTextSpan || usernamesTextSpan.tagName !== "SPAN") {
        // console.log("Could not find the usernames text span for multi-user cell:", cell);
        return; // Skip if we can't find where to update text
      }

      let processedAtLeastOneUser = false;
      const usernamesToFetch = new Set(); // Use a Set to avoid duplicate fetches for the same user in this cell

      avatarImgs.forEach((img) => {
        const potentialUsername = img.alt ? img.alt.replace("@", "").trim() : null;
        if (isValidUsername(potentialUsername)) {
          usernamesToFetch.add(potentialUsername);
        }
      });

      if (usernamesToFetch.size === 0) {
        // No valid usernames extracted from alt tags, maybe mark as processed to avoid retrying?
        // For now, let's only mark if we actually attempt fetches.
        return;
      }

      usernamesToFetch.forEach((username) => {
        processedAtLeastOneUser = true;
        const processUpdate = (userData) => { // Changed parameter name
          // Update alt attributes of all matching images within this specific multiUserSpan
          avatarImgs.forEach((img) => {
            const originalAlt = img.alt
              ? img.alt.replace("@", "").trim()
              : null;
            if (originalAlt === username) {
              if (img.alt !== `@${userData}`) {
                img.alt = `@${userData}`;
              }
            }
          });
          // Update the text in the usernamesTextSpan
          updateTextNodes(usernamesTextSpan, username, userData);
        };

        if (displayNames[username]) {
          processUpdate(displayNames[username]);
        } else {
          registerElement(username, processUpdate);
          fetchDisplayName(username);
        }
      });

      // Mark the cell as processed if we initiated any processing for its users.
      if (processedAtLeastOneUser) {
        cell.setAttribute(PROCESSED_MARKER, "true");
      }
    });
  }

  // Register an update callback for an element associated with a username.
  // When we have the display name, the callback will be invoked.
  function registerElement(username, updateCallback) {
    if (!elementsByUsername[username]) {
      elementsByUsername[username] = [];
    }
    elementsByUsername[username].push(updateCallback);
  }

  /**
   * Call all registered callbacks for a username once, then clear them out.
   */
  function updateElements(username) {
    const callbacks = elementsByUsername[username];
    if (!callbacks) return;

    const data = displayNames[username] || username;
    // Ensure we only run each callback a single time
    delete elementsByUsername[username];

    callbacks.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        console.error("Error updating element for @" + username, e);
      }
    });
  }

  /**
   * Walk all text nodes under `element`, replace @username or username tokens
   * with the userData—but skip any node that already contains the full userData.
   */
  // updateTextNodes is imported from content-utils.js

  // ------------------------------
  // Fetching & Caching Display Names
  // ------------------------------

  // isBotUsername is imported from content-utils.js

  async function fetchDisplayName(username) {
    // First, ensure username is valid and not a bot before any processing
    if (!isValidUsername(username)) { // Should have been caught earlier, but as a safeguard
      // console.warn(`fetchDisplayName called with invalid username: ${username}`);
      displayNames[username] = username; // Store original invalid name to prevent re-fetch
      updateElements(username);
      return;
    }

    if (isBotUsername(username)) {
      // console.log(`Skipping fetch for known bot: @${username}`);
      displayNames[username] = username; // Use the username itself as the display name
      updateElements(username);
      return;
    }

    // Only look up in cache if not already present in displayNames
    if (displayNames[username]) {
      updateElements(username);
      return;
    }
    try {
      // Get settings to check if display name parsing is enabled
      const settings = await getSettings();
      const parseEnabled = settings.parseDisplayNameFormat || false;

      let cache = await getCache();
      const serverCache = cache[location.hostname] || {};
      let entry = serverCache[username];

      if (entry) {
        // Apply display name parsing if enabled
        const parsedDisplayName = parseDisplayNameFormat(entry.displayName, parseEnabled);
        displayNames[username] = parsedDisplayName;
        updateElements(username);
        return;
      }

      // Check if extension context is valid before making runtime calls
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot fetch display name for @' + username);
        displayNames[username] = username;
        updateElements(username);
        return;
      }

      // Request the lock from the background service.
      let lockResponse;
      try {
        lockResponse = await chrome.runtime.sendMessage({
          type: "acquireLock",
          origin: location.hostname,
          username: username,
        });
      } catch (e) {
        console.warn('Failed to acquire lock for @' + username + ':', e.message);
        displayNames[username] = username;
        updateElements(username);
        return;
      }

      if (lockResponse && lockResponse.acquired) {
        // We have the lock—fetch the GitHub profile page.
        const profileUrl = `https://${location.hostname}/${username}`;
        const response = await fetch(profileUrl);
        if (!response.ok) {
          throw new Error("HTTP error " + response.status);
        }
        const html = await response.text();

        // Parse the HTML using a DOMParser.
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const el = doc.querySelector(".vcard-fullname");
        let displayName = el ? el.textContent.trim() : username;

        if (!displayName || displayName.trim() === '') {
          displayName = username;
        }

        // Apply display name parsing if enabled
        const parsedDisplayName = parseDisplayNameFormat(displayName, parseEnabled);

        // Tell the background to update the cache and release the lock.
        try {
          await chrome.runtime.sendMessage({
            type: "releaseLock",
            origin: location.hostname,
            username: username,
            displayName: displayName, // Store original in cache
          });
        } catch (e) {
          console.warn('Failed to release lock for @' + username + ':', e.message);
          // Continue anyway - we still want to use the display name we fetched
        }

        displayNames[username] = parsedDisplayName; // Use parsed version in memory
        updateElements(username);
      } else {
        // Another content script is already fetching this profile.
        // Poll until the cache is updated.
        const maxAttempts = 10;
        let attempt = 0;
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        while (attempt < maxAttempts) {
          await wait(500);
          let cache = await getCache();
          const serverCache = cache[location.hostname] || {};
          let entry = serverCache[username];
          if (entry) {
            // Apply display name parsing if enabled
            const parsedDisplayName = parseDisplayNameFormat(entry.displayName, parseEnabled);
            displayNames[username] = parsedDisplayName;
            updateElements(username);
            return;
          }
          attempt++;
        }
        // Fallback if we still haven't received a display name.
        displayNames[username] = username;
        updateElements(username);
      }
    } catch (err) {
      console.error("Error fetching display name for @" + username, err);
      displayNames[username] = username; // Fallback to username on error
      updateElements(username);
    }
  }

  // ------------------------------
  // DOM Processing Functions
  // ------------------------------

  // Use HOVERCARD_PROCESSED_MARKER from window (set by content-utils.js)
  const HOVERCARD_PROCESSED_MARKER = window.HOVERCARD_PROCESSED_MARKER;

  function processHovercard(hovercardElement) {
    if (hovercardElement.hasAttribute(HOVERCARD_PROCESSED_MARKER)) {
      return;
    }
    // Logs removed
    let username;
    let hydroView;
    let jsonData;

    try {
      hydroView = hovercardElement.getAttribute("data-hydro-view");
      if (!hydroView) return;
      jsonData = JSON.parse(hydroView);
      username = jsonData?.payload?.card_user_login;

      if (!username && jsonData?.payload?.originating_url) {
        // Attempt to extract username from originating_url as a fallback
        // Example: "https://github.com/users/SethRobinson/hovercard?..."
        const urlPattern = /\/users\/([^\/]+)\/hovercard/;
        const match = jsonData.payload.originating_url.match(urlPattern);
        if (match && match[1]) {
          username = match[1];
        }
      }

    } catch (e) {
      console.error("Error parsing hovercard data-hydro-view:", e, hovercardElement); // Kept general error log
      return;
    }

    if (!username) {
      // console.log("No username found in hovercard data:", hovercardElement); // Kept original commented-out log
      return;
    }
    // console.log("[GHU HC Debug] Username extracted:", username); // Debug log removed

    if (!isValidUsername(username)) {
      // If the extracted username isn't valid, we might not want to proceed
      // or mark as processed to prevent re-attempts on invalid data.
      // For now, let's log it if it's an actual value but invalid.
      // if (username) console.warn("Invalid username extracted from hovercard:", username, hovercardElement);
      // Mark as processed to avoid retrying invalid username from hovercard.
      hovercardElement.setAttribute(HOVERCARD_PROCESSED_MARKER, "true");
      return;
    }

    const processUpdate = (userData) => {
      // console.log("[GHU HC Debug] processUpdate called for username:", username, "with userData:", userData); // Debug log removed
      if (hovercardElement.hasAttribute(HOVERCARD_PROCESSED_MARKER)) {
        // console.log("[GHU HC Debug] Element already has HOVERCARD_PROCESSED_MARKER (inside processUpdate). Exiting."); // Debug log removed
        return;
      }
      // console.log("[GHU HC Debug] processUpdate: Element does not have marker. Proceeding to create row."); // Debug log removed

      // Check if extension context is valid before using chrome.runtime
      if (!isExtensionContextValid()) {
        console.warn('Extension context invalidated, cannot add hovercard for @' + username);
        return;
      }

      let iconUrl;
      try {
        iconUrl = chrome.runtime.getURL("icon16.png");
      } catch (e) {
        console.warn('Failed to get icon URL:', e.message);
        return;
      }
      // Removed expirationText definition and logic block

      const newRow = document.createElement("div");
      newRow.classList.add("d-flex", "flex-items-baseline", "f6", "mt-1", "color-fg-muted");
      newRow.style.cursor = "pointer";
      // Removed direct style settings for display, alignItems, marginTop, paddingTop, borderTop

      const iconContainer = document.createElement('div');
      iconContainer.classList.add("mr-1", "flex-shrink-0");

      const iconImg = document.createElement('img');
      iconImg.src = iconUrl;
      iconImg.alt = "Extension icon"; // Added alt text
      iconImg.style.width = "16px";
      iconImg.style.height = "16px";
      iconImg.style.verticalAlign = "middle"; // May help alignment

      iconContainer.appendChild(iconImg);

      const textContainer = document.createElement('span');
      textContainer.classList.add("lh-condensed", "overflow-hidden", "no-wrap"); // no-wrap for ellipsis
      textContainer.style.textOverflow = "ellipsis";
      textContainer.textContent = userData; // Only display name
      
      // Clear any previous innerHTML (though newRow is fresh, good practice if refactoring)
      newRow.innerHTML = ''; 
      newRow.appendChild(iconContainer);
      newRow.appendChild(textContainer);

      newRow.addEventListener("click", () => {
        if (!isExtensionContextValid()) {
          console.warn('Extension context invalidated, cannot open options page');
          return;
        }
        try {
          chrome.runtime.sendMessage({ type: "openOptionsPage", url: `options.html#${username}` });
        } catch (e) {
          console.warn('Failed to open options page:', e.message);
        }
      });
      // newRow.style.cursor = "pointer"; // Already set above

      // Append to the correct container within the hovercard
      // The main content area often has a class like "Popover-message" or specific padding classes.
      // GitHub's structure: div[data-hydro-view] > div.Popover > div.Popover-message > div (target for append)
      // Or it could be a simpler structure like div[data-hydro-view] > div.px-3.pb-3
      // This logic for finding the append target should be preserved.
      const appendTarget = hovercardElement.querySelector('.Popover-message > div:not([class])') || 
                         hovercardElement.querySelector('.Popover-message > div[class*="Popover-message--large"]') || 
                         hovercardElement.querySelector('.px-3.pb-3') || 
                         hovercardElement;
      
      // Ensure not to add multiple times (though marker should prevent this)
      // Check if a row with our specific structure (e.g. an icon with alt "Extension icon") already exists.
      let existingExtensionRow = appendTarget.querySelector('img[alt="Extension icon"]');
      // More specific check if the parent has our classes
      if (existingExtensionRow && existingExtensionRow.parentElement && existingExtensionRow.parentElement.parentElement === newRow.parentElement && existingExtensionRow.parentElement.classList.contains("mr-1")) {
          // Already added, do nothing or replace. For now, rely on HOVERCARD_PROCESSED_MARKER.
      } else {
        // Add a top border to newRow to separate it visually, like other GitHub hovercard items
        // This was previously handled by inline style, now handled by GitHub classes or explicit addition if needed
        // GitHub's .mt-1 handles margin, but a border might be desired for separation.
        // If the classes "d-flex flex-items-baseline f6 mt-1 color-fg-muted" don't provide a visual separator,
        // a border can be added. For now, let's assume these classes are sufficient or a border is not strictly needed
        // if it visually aligns with other non-bordered items.
        // However, the original plan had a border, let's add it back if GH classes don't provide it.
        // No, the plan was to REMOVE inline styles for borderTop. Let's stick to that.
        // If a border is needed, it should be a class or a final style adjustment.
        // For now, let's assume the classes are enough or a borderless look is acceptable.
        appendTarget.appendChild(newRow);
      }

      hovercardElement.setAttribute(HOVERCARD_PROCESSED_MARKER, "true");
    };

    if (displayNames[username]) {
      processUpdate(displayNames[username]);
    } else {
      registerElement(username, processUpdate);
      fetchDisplayName(username);
    }
  }

  function processSingleUserGridCell(root) {
    if (!(root instanceof Element)) return;

    let cellsToProcess = [];
    if (root.matches('div[role="gridcell"]')) {
      cellsToProcess.push(root);
    }
    // Prevent adding root twice if it's also captured by querySelectorAll (though unlikely for this specific case if root is the cell)
    cellsToProcess.push(
      ...Array.from(root.querySelectorAll('div[role="gridcell"]'))
    );
    // Use a Set to automatically handle deduplication if any node was added twice.
    const uniqueCells = Array.from(new Set(cellsToProcess));

    uniqueCells.forEach((cell) => {
      if (cell.hasAttribute(PROCESSED_MARKER)) {
        return;
      }

      const avatarImg = cell.querySelector('img[data-testid="github-avatar"]');
      if (!avatarImg) {
        return;
      }

      const potentialUsername = avatarImg.alt
        ? avatarImg.alt.replace("@", "").trim()
        : null;

      if (!isValidUsername(potentialUsername)) {
        // If the alt text is not a valid username, mark cell as processed and skip.
        cell.setAttribute(PROCESSED_MARKER, "true");
        return;
      }
      const username = potentialUsername;

      // Find the span containing the username.
      // This is a simple approach: find all spans and check their textContent.
      let usernameSpan = null;
      const spans = cell.querySelectorAll("span");
      for (let span of spans) {
        if (
          span.textContent.trim() === username ||
          span.textContent.trim() === `@${username}`
        ) {
          usernameSpan = span;
          break;
        }
      }

      // If a direct child span of the cell (or its descendants) contains the username.
      // This is a common pattern in some UIs.
      if (!usernameSpan) {
        const potentialSpans = cell.querySelectorAll(
          "div > span, div > div > span"
        ); // Adjust depth as needed
        for (let span of potentialSpans) {
          if (
            span.textContent.trim() === username ||
            span.textContent.trim() === `@${username}`
          ) {
            usernameSpan = span;
            break;
          }
        }
      }

      if (usernameSpan) {
        const processUpdate = (userData) => { // Changed parameter name
          if (avatarImg.alt !== `@${userData}`) {
            avatarImg.alt = `@${userData}`; // Typically includes @
          }
          updateTextNodes(usernameSpan, username, userData);
          // Mark the cell itself as processed after successful update attempt.
          // This ensures we don't re-process if the initial fetchDisplayName fails
          // and then a mutation observer picks it up again.
          // The updateTextNodes and alt setting are idempotent if displayNames[username] is already correct.
          cell.setAttribute(PROCESSED_MARKER, "true");
        };

        if (displayNames[username]) {
          processUpdate(displayNames[username]);
        } else {
          registerElement(username, processUpdate);
          fetchDisplayName(username);
        }
      } else {
        // If no span is found, we might still want to mark the cell as processed
        // to avoid re-checking it repeatedly if the structure is unexpected.
        // However, this could prevent processing if the span appears later due to JS rendering.
        // For now, let's only mark as processed if we attempt an update.
        // console.log("No username span found for", username, "in cell:", cell);
      }
    });
  }

  function processProjectElements(root) {
    if (!(root instanceof Element)) return;

    const avatarSelector = 'img[data-testid="github-avatar"]';
    let avatarsToProcess = [];

    if (root.matches(avatarSelector)) {
      avatarsToProcess.push(root);
    }
    // Deduplicate if root itself is an avatar and also found by querySelectorAll
    const descendantAvatars = Array.from(root.querySelectorAll(avatarSelector));
    avatarsToProcess = Array.from(
      new Set([...avatarsToProcess, ...descendantAvatars])
    );

    avatarsToProcess.forEach((avatarElement) => {
      let userElement = null;

      // Primary strategy: Traverse based on expected relative structure
      const iconWrapper = avatarElement.parentElement;
      const leadingVisualWrapper = iconWrapper
        ? iconWrapper.parentElement
        : null;
      // Check if leadingVisualWrapper is not null and has a next sibling
      const mainContentWrapper =
        leadingVisualWrapper && leadingVisualWrapper.nextElementSibling
          ? leadingVisualWrapper.nextElementSibling
          : null;

      if (mainContentWrapper) {
        // We expect the H3 to be a descendant of mainContentWrapper
        // Querying for any h1,h2,h3,h4 and taking the first found.
        // This provides some flexibility if H3 is not always used.
        userElement = mainContentWrapper.querySelector("h1, h2, h3, h4, h5, h6");
      }

      // Fallback strategy: if primary strategy failed, try finding H3 within closest LI
      if (!userElement) {
        const listItemAncestor = avatarElement.closest("li");
        if (listItemAncestor) {
          // Query for any h1,h2,h3,h4 and taking the first found within the LI
          userElement = listItemAncestor.querySelector("h1, h2, h3, h4, h5, h6");
        }
      }

      // Fallback strategy 2: if still no element, try a broader search within a less specific ancestor
      // This is a wider net and should be used cautiously.
      // Go up 3 levels from avatar and search for element there.
      if (!userElement) {
        let current = avatarElement;
        let parentCount = 0;
        for (let i = 0; i < 3 && current.parentElement; i++) {
          current = current.parentElement;
          parentCount++;
        }
        // Only proceed if we actually moved up and didn't hit document body/root too early
        if (
          parentCount > 0 &&
          current &&
          current !== document.body &&
          current !== document.documentElement
        ) {
          userElement = current.querySelector("h1, h2, h3, h4, h5, h6");
        }
      }

      if (!userElement) {
        // console.warn('Could not find a suitable H3 element for avatar:', avatarElement);
        return;
      }

      if (userElement.hasAttribute(PROCESSED_MARKER)) {
        return;
      }

      let username = null;
      let usernameSourceElement = userElement; // Default to h3 for marking processed

      // Strategy 1: Look for an <a> tag within the Element that could be a user link
      const userLinkInH3 = userElement.querySelector('a[href^="/"]');
      if (userLinkInH3) {
        const potentialUsernameFromLink = getUsername(userLinkInH3); // getUsername already uses isValidUsername
        if (potentialUsernameFromLink) {
          username = potentialUsernameFromLink;
          usernameSourceElement = userLinkInH3; // Mark the link if username found here
        }
      }

      // Strategy 2: If no link in element, check if element text itself is a valid username.
      // This is the fallback and should be used cautiously.
      // We rely on isValidUsername to filter out commit titles etc.
      if (!username) {
        const potentialUsernameFromH3Text = userElement.textContent.trim();
        if (isValidUsername(potentialUsernameFromH3Text) && potentialUsernameFromH3Text !== "No Assignees") {
          username = potentialUsernameFromH3Text;
        }
      }

      if (!username) {
        // If no valid username could be extracted from link or text, mark and skip.
        // handles cases like "No Assignees" or headers that are definitely not usernames.
        userElement.setAttribute(PROCESSED_MARKER, "true");
        return;
      }

      // Mark the source element (h3 or the link within it) as processed if we have a valid username.
      // This is to prevent reprocessing if the initial fetch fails and mutation observer picks it up again.
      // However, the actual update callback will mark the element after successful text update.
      // Let's ensure the main element is marked to prevent re-evaluating it.
      // The PROCESSED_MARKER on element was already there and is good.

      const processUpdate = (userData) => {
        // Update the text content
        const updated = updateTextNodes(userElement, username, userData);
        if (updated) {
          // Mark the element as processed only if text was changed to avoid issues
          // if multiple valid usernames were somehow in the same element (unlikely).
          userElement.setAttribute(PROCESSED_MARKER, "true");
        }

        // Update avatar alt text
        if (avatarElement.alt !== `@${userData}`) {
          avatarElement.alt = `@${userData}`;
        }
      };

      if (displayNames[username]) {
        processUpdate(displayNames[username]);
      } else {
        registerElement(username, processUpdate);
        fetchDisplayName(username);
      }
    });
  }

  /**
   * Processes anchor tags that have a data-hovercard-url starting with "/users/", or
   * have a hovercard-link-click attribute.
   * For each such anchor:
   * - If its content is solely a <span class="AppHeader-context-item-label">, skip it.
   * - Otherwise, register a callback so that once the display name is available, every text node within the anchor
   *   that contains the username (or "@username") is updated to the display name.
   */
  function processAnchorsByHovercard(root) {
    if (!(root instanceof Element)) return; // Ensure root is an Element

    const selector =
      'a[data-hovercard-url^="/users/"], a[data-octo-click="hovercard-link-click"]';
    let elementsToProcess = [];

    if (root.matches(selector)) {
      elementsToProcess.push(root);
    }
    // Add descendants, ensuring not to add duplicates if root itself was captured by querySelectorAll from a higher level
    // However, PROCESSED_MARKER handles actual duplicate processing effectively.
    elementsToProcess.push(...Array.from(root.querySelectorAll(selector)));

    // If root itself matches and is also found by querySelectorAll (e.g. if root is child of itself, which is not possible)
    // a simple Set could deduplicate: elementsToProcess = Array.from(new Set(elementsToProcess));
    // But given PROCESSED_MARKER, explicit deduplication here is likely not critical.

    elementsToProcess.forEach((anchor) => {
      if (anchor.hasAttribute(PROCESSED_MARKER)) return;

      // Exception: if the anchor's entire content is a single span with the specified class and text, skip processing.
      if (anchor.children.length === 1) {
        const child = anchor.children[0];
        if (
          child.tagName === "SPAN" &&
          child.classList.contains("AppHeader-context-item-label")
        ) {
          return;
        }
      }

      // Extract the username.
      const username = getUsername(anchor);
      if (!username) return;

      // If the display name is already available, update immediately; otherwise, fetch it.
      if (displayNames[username]) {
        const updated = updateTextNodes(
          anchor,
          username,
          displayNames[username]
        );
        if (updated) {
          anchor.setAttribute(PROCESSED_MARKER, "true");
        }
      } else {
        registerElement(username, (name) => { // Changed parameter name
          const updated = updateTextNodes(anchor, username, name);
          if (updated) {
            anchor.setAttribute(PROCESSED_MARKER, "true");
          }
        });
        fetchDisplayName(username);
      }
    });
  }

  // getUsername is imported from content-utils.js

  // Set up a MutationObserver to handle new elements.
  let debounceTimeout = null;
  const nodesToProcess = new Set();
  const DEBOUNCE_DELAY = 200; // ms

  function processCollectedNodes() {
    nodesToProcess.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) { // Ensure it's still an element node
        processAnchorsByHovercard(node);
        processProjectElements(node);
        processSingleUserGridCell(node);
        processMultiUserGridCell(node);
        processBoardGroupHeader(node);
        processBlockedSectionMessages(node);

        // Check for hovercards
        const hovercardSelector = 'div[data-hydro-view*="user-hovercard-hover"]';
        // Check if the node itself is a hovercard
        if (node.matches && node.matches(hovercardSelector)) {
          processHovercard(node);
        }
        // Check children of the added node for hovercards
        // This is important because a larger container might be added,
        // and the hovercard itself is a descendant.
        if (node.querySelectorAll) {
          const childrenCards = node.querySelectorAll(hovercardSelector);
          childrenCards.forEach(processHovercard);
        }
      }
    });
    nodesToProcess.clear();
  }

  const observer = new MutationObserver((mutations) => {
    let addedRelevantNode = false;
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Add node to the set for processing.
          // We add any element node and let the process functions filter.
          // This is simpler than trying to be too specific here.
          nodesToProcess.add(node);
          addedRelevantNode = true;
        }
      });
    }

    if (addedRelevantNode) {
      // Check if debounce logic should be skipped (using cached settings for instant access)
      if (cachedSettings.skipDebounceLogic) {
        // Process immediately without debounce
        processCollectedNodes();
      } else {
        // Use debounce logic
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(processCollectedNodes, DEBOUNCE_DELAY);
      }
    }
  });

  // Initialize the extension by pre-loading cached display names and settings
  async function initialize() {
    // Pre-load settings into memory for instant access
    try {
      cachedSettings = await getSettings();
    } catch (err) {
      console.warn('Error pre-loading settings:', err);
      cachedSettings = {};
    }

    // Pre-load cached display names into memory for instant replacement
    try {
      const parseEnabled = cachedSettings.parseDisplayNameFormat || false;
      const cache = await getCache();
      const serverCache = cache[location.hostname] || {};

      // Pre-populate displayNames with all cached usernames for this hostname
      for (const username in serverCache) {
        const entry = serverCache[username];
        if (entry && entry.displayName) {
          const parsedDisplayName = parseDisplayNameFormat(entry.displayName, parseEnabled);
          displayNames[username] = parsedDisplayName;
        }
      }
    } catch (err) {
      console.warn('Error pre-loading cache:', err);
    }

    // Listen for settings changes to update cached settings
    if (chrome && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes[SETTINGS_KEY]) {
          cachedSettings = changes[SETTINGS_KEY].newValue || {};
        }
      });
    }

    // Start observing DOM changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial scan for existing elements on page load
    processAnchorsByHovercard(document.body);
    processProjectElements(document.body);
    processSingleUserGridCell(document.body);
    processMultiUserGridCell(document.body);
    processBoardGroupHeader(document.body);
    processBlockedSectionMessages(document.body);
    document.querySelectorAll('div[data-hydro-view*="user-hovercard-hover"]').forEach(processHovercard);
  }

  // Start the extension
  initialize();
})();
