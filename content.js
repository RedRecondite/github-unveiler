(() => {
  // ------------------------------
  // Global Variables & Cache Setup
  // ------------------------------
  const PROCESSED_MARKER = "data-ghu-processed";
  const CACHE_KEY = "githubDisplayNameCache";
  const displayNames = {}; // username => fetched display name
  const elementsByUsername = {}; // username => array of update callbacks

  // Helper: Get the cache from chrome.storage.local.
  function getCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get([CACHE_KEY], (result) => {
        resolve(result[CACHE_KEY] || {});
      });
    });
  }

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

      const username = avatarImg.alt
        ? avatarImg.alt.replace("@", "").trim()
        : null;
      if (!username) return;

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

      const processUpdate = (displayName) => {
        if (avatarImg.alt !== `@${displayName}`) {
          avatarImg.alt = `@${displayName}`;
        }
        updateTextNodes(usernameTextSpan, username, displayName);

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
              displayName
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
        const username = img.alt ? img.alt.replace("@", "").trim() : null;
        if (username) {
          usernamesToFetch.add(username);
        }
      });

      if (usernamesToFetch.size === 0) {
        // No valid usernames extracted from alt tags, maybe mark as processed to avoid retrying?
        // For now, let's only mark if we actually attempt fetches.
        return;
      }

      usernamesToFetch.forEach((username) => {
        processedAtLeastOneUser = true;
        const processUpdate = (displayName) => {
          // Update alt attributes of all matching images within this specific multiUserSpan
          avatarImgs.forEach((img) => {
            const originalAlt = img.alt
              ? img.alt.replace("@", "").trim()
              : null;
            if (originalAlt === username) {
              if (img.alt !== `@${displayName}`) {
                img.alt = `@${displayName}`;
              }
            }
          });
          // Update the text in the usernamesTextSpan
          updateTextNodes(usernamesTextSpan, username, displayName);
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

    const name = displayNames[username] || username;
    // Ensure we only run each callback a single time
    delete elementsByUsername[username];

    callbacks.forEach((cb) => {
      try {
        cb(name);
      } catch (e) {
        console.error("Error updating element for @" + username, e);
      }
    });
  }

  /**
   * Walk all text nodes under `element`, replace @username or username tokens
   * with the displayName—but skip any node that already contains the full displayName.
   */
  function updateTextNodes(element, username, displayName) {
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
      // If we've already inserted the full displayName here, skip it
      if (node.textContent.includes(displayName)) {
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
        match.startsWith("@") ? `@${displayName}` : displayName
      );
      if (updated !== node.textContent) {
        node.textContent = updated;
        changed = true;
      }
    }
    return changed;
  }

  // ------------------------------
  // Fetching & Caching Display Names
  // ------------------------------
  async function fetchDisplayName(username) {
    // Only look up in cache if not already present in displayNames
    if (displayNames[username]) {
      updateElements(username);
      return;
    }
    try {
      let cache = await getCache();
      const serverCache = cache[location.hostname] || {};
      let entry = serverCache[username];

      if (entry) {
        displayNames[username] = entry.displayName;
        updateElements(username);
        return;
      }

      // Request the lock from the background service.
      const lockResponse = await chrome.runtime.sendMessage({
        type: "acquireLock",
        origin: location.hostname,
        username: username,
      });

      if (lockResponse.acquired) {
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

        // Tell the background to update the cache and release the lock.
        await chrome.runtime.sendMessage({
          type: "releaseLock",
          origin: location.hostname,
          username: username,
          displayName: displayName,
        });

        displayNames[username] = displayName;
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
            displayNames[username] = entry.displayName;
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
      displayNames[username] = username;
      updateElements(username);
    }
  }

  // ------------------------------
  // DOM Processing Functions
  // ------------------------------

  function processSingleUserGridCell(root) {
    if (!(root instanceof Element)) return;

    let cellsToProcess = [];
    if (root.matches('div[role="gridcell"]')) {
      cellsToProcess.push(root);
    }
    // Prevent adding root twice if it's also captured by querySelectorAll (though unlikely for this specific case if root is the cell)
    // However, the PROCESSED_MARKER check handles actual duplicate processing.
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

      const username = avatarImg.alt
        ? avatarImg.alt.replace("@", "").trim()
        : null;
      if (!username) {
        return;
      }

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
        const processUpdate = (displayName) => {
          if (avatarImg.alt !== displayName) {
            avatarImg.alt = `@${displayName}`; // Typically includes @
          }
          updateTextNodes(usernameSpan, username, displayName);
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

  // Function to update the element directly
  function updateElementDirectly(element, username, displayName) {
    let changed = false;
    if (
      element.tagName === "H3" &&
      element.classList.contains("slicer-items-module__title--EMqA1")
    ) {
      // updateTextNodes returns true if it made a change
      changed = updateTextNodes(element, username, displayName);
    } else if (
      element.tagName === "IMG" &&
      element.dataset.testid === "github-avatar"
    ) {
      if (element.alt === displayName) return false; // Already updated
      element.alt = displayName;
      changed = true;
    } else if (
      element.tagName === "SPAN" &&
      element.hasAttribute("aria-label")
    ) {
      if (element.getAttribute("aria-label") === displayName) return false; // Already updated
      element.setAttribute("aria-label", displayName);
      changed = true;
    }
    return changed;
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
      let h3Element = null;

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
        h3Element = mainContentWrapper.querySelector("h1, h2, h3, h4, h5, h6");
      }

      // Fallback strategy: if primary strategy failed, try finding H3 within closest LI
      if (!h3Element) {
        const listItemAncestor = avatarElement.closest("li");
        if (listItemAncestor) {
          // Query for any h1,h2,h3,h4 and taking the first found within the LI
          h3Element = listItemAncestor.querySelector("h1, h2, h3, h4, h5, h6");
        }
      }

      // Fallback strategy 2: if still no H3, try a broader search within a less specific ancestor
      // This is a wider net and should be used cautiously.
      // Go up 3 levels from avatar and search for H3 there.
      if (!h3Element) {
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
          h3Element = current.querySelector("h1, h2, h3, h4, h5, h6");
        }
      }

      if (!h3Element) {
        // console.warn('Could not find a suitable H3 element for avatar:', avatarElement);
        return;
      }

      if (h3Element.hasAttribute(PROCESSED_MARKER)) {
        return;
      }

      const username = h3Element.textContent.trim();

      if (!username || username === "No Assignees" || username === "") {
        // Removed username.includes(' ')
        // console.log('Skipping invalid or placeholder username (or one with spaces that was previously skipped):', username);
        return;
      }

      const processUpdate = (nameToDisplay) => {
        const h3Updated = updateTextNodes(h3Element, username, nameToDisplay);
        if (h3Updated) {
          h3Element.setAttribute(PROCESSED_MARKER, "true");
        }
        if (avatarElement.alt !== nameToDisplay) {
          avatarElement.alt = nameToDisplay;
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
        registerElement(username, (displayName) => {
          const updated = updateTextNodes(anchor, username, displayName);
          if (updated) {
            anchor.setAttribute(PROCESSED_MARKER, "true");
          }
        });
        fetchDisplayName(username);
      }
    });
  }

  // Get the username from the anchor tag, preferring the data-hovercard-url to the href.
  function getUsername(anchor) {
    const hover = anchor.getAttribute("data-hovercard-url");
    const href = anchor.getAttribute("href");
    if (hover) {
      const match = hover.match(/^\/users\/((?!.*%5Bbot%5D)[^\/?]+)/);
      if (match) return match[1];
    } else if (href) {
      const match = href.match(/^\/((?!orgs\/)(?!.*%5Bbot%5D)[^\/?]+)\/?$/);
      if (match) return match[1];
    }
    return;
  }

  // Initial processing.
  processAnchorsByHovercard(document.body);
  processProjectElements(document.body);
  processSingleUserGridCell(document.body);
  processMultiUserGridCell(document.body);
  processBoardGroupHeader(document.body);

  // Set up a MutationObserver to handle new elements.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          processAnchorsByHovercard(node);
          processProjectElements(node);
          processSingleUserGridCell(node);
          processMultiUserGridCell(node);
          processBoardGroupHeader(node);
        }
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
