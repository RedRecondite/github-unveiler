(() => {
  // ------------------------------
  // Global Variables & Cache Setup
  // ------------------------------
  const CACHE_KEY = "githubDisplayNameCache";
  const displayNames = {};    // username => fetched display name
  const elementsByUsername = {}; // username => array of update callbacks

  // Helper: Get the cache from chrome.storage.local.
  function getCache() {
    return new Promise((resolve) => {
      chrome.storage.local.get([CACHE_KEY], (result) => {
        resolve(result[CACHE_KEY] || {});
      });
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
    while ((node = walker.nextNode())) {
      // If we've already inserted the full displayName here, skip it
      if (node.textContent.includes(displayName)) continue;

      const updated = node.textContent.replace(regex, (match) =>
        match.startsWith("@") ? `@${displayName}` : displayName
      );
      if (updated !== node.textContent) {
        node.textContent = updated;
      }
    }
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
        username: username
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
        const doc = parser.parseFromString(html, 'text/html');
        const el = doc.querySelector('.vcard-fullname');
        let displayName = el ? el.textContent.trim() : username;

        // Tell the background to update the cache and release the lock.
        await chrome.runtime.sendMessage({
          type: "releaseLock",
          origin: location.hostname,
          username: username,
          displayName: displayName
        });

        displayNames[username] = displayName;
        updateElements(username);
      } else {
        // Another content script is already fetching this profile.
        // Poll until the cache is updated.
        const maxAttempts = 10;
        let attempt = 0;
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
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

  /**
   * Processes anchor tags that have a data-hovercard-url starting with "/users/", or
   * have a hovercard-link-click attribute.
   * For each such anchor:
   * - If its content is solely a <span class="AppHeader-context-item-label">, skip it.
   * - Otherwise, register a callback so that once the display name is available, every text node within the anchor
   *   that contains the username (or "@username") is updated to the display name.
   */
  function processAnchorsByHovercard(root) {
    // Select anchor tags with a data-hovercard-url attribute starting with "/users/"
    // or have a data-octo-click attribute equal to 'hovercard-link-click'
    const anchors = root.querySelectorAll(
      'a[data-hovercard-url^="/users/"], a[data-octo-click="hovercard-link-click"]'
    );
    anchors.forEach((anchor) => {
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
        updateTextNodes(anchor, username, displayNames[username]);
      } else {
        registerElement(username, (displayName) => {
          updateTextNodes(anchor, username, displayName);
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
    }
    else if (href) {
      const match = href.match(/^\/((?!orgs\/)(?!.*%5Bbot%5D)[^\/?]+)\/?$/);
      if (match) return match[1];
    }
    return;
  }

  // Initial processing.
  processAnchorsByHovercard(document.body);

  // Set up a MutationObserver to handle new elements.
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          processAnchorsByHovercard(node);
        }
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
