// content.idempotency.test.js

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Idempotency and Marker Tests", () => {
  // --- Start of common setup for content.js testing ---
  let displayNames = {};
  let elementsByUsername = {};
  let lastRegisteredCallback = null;
  let fetchDisplayName;
  let registerElement;
  let updateElements;
  let updateTextNodes;
  
  // Functions to be tested/used in this suite
  let processAnchorsByHovercard;
  let getUsername; // Helper for anchors
  let processProjectElements;

  const PROCESSED_MARKER = "data-ghu-processed";
  const CACHE_KEY = "githubDisplayNameCache";

  const mockDisplayNamesForFetch = {
    TBBle: 'Paul "TBBle" Hampson',
    projectUser1: "Project User One",
  };
  
  // Helper function to create the primary DOM structure for project elements
  function setupPrimaryDOM(username, headingTag = "h3", initialAvatarAlt = null) {
    const avatarAlt = initialAvatarAlt !== null ? initialAvatarAlt : username;
    // Create a detached root for this specific setup to avoid innerHTML on document.body directly in setup
    const rootElement = document.createElement('div');
    rootElement.innerHTML = `
      <div class="item-container-generic">
        <div class="leading-visual-wrapper-generic">
          <div class="icon-wrapper-generic">
            <img data-testid="github-avatar" alt="${avatarAlt}" src="#" />
          </div>
        </div>
        <div class="main-content-wrapper-generic">
          <${headingTag}>${username}</${headingTag}>
        </div>
      </div>
    `;
    document.body.appendChild(rootElement);
    return {
      avatar: rootElement.querySelector('img[data-testid="github-avatar"]'),
      heading: rootElement.querySelector(headingTag),
      rootElement: rootElement.firstChild 
    };
  }

  beforeAll(() => {
    global.chrome = {
      storage: { local: { get: jest.fn(), set: jest.fn() } },
      runtime: {
        sendMessage: jest.fn(), lastError: null,
        getURL: jest.fn(path => `chrome://extension-id/${path}`),
      },
    };
    global.fetch = jest.fn(); // Default mock, can be overridden by tests
    global.location = { hostname: "github.com" };

    updateTextNodes = (element, username, nameToDisplay) => {
      const baseUsername = username.replace(/^@/, "");
      const escapedBaseUsername = baseUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Match original content.js regex (no 'i' flag)
      const regex = new RegExp(`(?<!\\w)@?${escapedBaseUsername}(?!\\w)`, "g"); 
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      let changed = false;
      while ((node = walker.nextNode())) {
        // IMPORTANT FOR IDEMPOTENCY: If the node *already* contains the full display name
        // and no longer contains the original username token, don't modify it.
        if (node.textContent.includes(nameToDisplay) && !node.textContent.match(regex)) {
            continue;
        }
        const updated = node.textContent.replace(regex, match =>
          match.startsWith("@") ? `@${nameToDisplay}` : nameToDisplay
        );
        if (updated !== node.textContent) {
          node.textContent = updated;
          changed = true;
        }
      }
      return changed;
    };

    updateElements = (username) => {
      const callbacks = elementsByUsername[username];
      if (!callbacks) return;
      const baseUsername = username.replace(/^@/, "");
      const userData = displayNames[baseUsername] || { name: baseUsername, timestamp: 0, noExpire: true };
      const cbsToRun = [...callbacks]; 
      elementsByUsername[username] = []; 
      cbsToRun.forEach(cb => {
        try { cb(userData); } catch (e) { console.error("Error in callback for @" + username, e); }
      });
    };

    registerElement = (username, cb) => {
      const baseUsername = username.replace(/^@/, "");
      if (!elementsByUsername[baseUsername]) elementsByUsername[baseUsername] = [];
      elementsByUsername[baseUsername].push(cb);
      lastRegisteredCallback = cb;
    };

    fetchDisplayName = jest.fn(async (rawUsername) => {
        const username = rawUsername.replace(/^@/, "");
        if (username === "No Assignees" || username === "") return;
        if (displayNames[username] && displayNames[username].name !== undefined) {
             updateElements(username); return;
        }
        try {
            // Use global.fetch (which tests can mock)
            const response = await global.fetch(`https://${global.location.hostname}/${username}`);
            if (!response.ok) throw new Error("HTTP error " + response.status);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const el = doc.querySelector(".vcard-fullname");
            let fetchedName = el ? el.textContent.trim() : username;
            if (!fetchedName || fetchedName.trim() === '') fetchedName = username;
            
            displayNames[username] = { name: fetchedName, timestamp: Date.now(), noExpire: false };
            await global.chrome.runtime.sendMessage({
                type: "releaseLock", origin: global.location.hostname,
                username: username, displayName: fetchedName
            });
            updateElements(username);
        } catch (err) {
            console.error(`Error fetching display name for @${username} (test mock):`, err);
            displayNames[username] = { name: username, timestamp: Date.now(), noExpire: true };
            updateElements(username);
        }
    });

    getUsername = (anchor) => { // Copied from content.anchor.test.js setup
        const hover = anchor.getAttribute("data-hovercard-url");
        const href = anchor.getAttribute("href");
        if (hover) {
          const match = hover.match(/^\/users\/((?!.*%5Bbot%5D)[^\/?]+)/);
          if (match) return match[1];
        } else if (href) {
          let match = href.match(/^\/(orgs\/[^\/]+\/people\/)?((?!.*%5Bbot%5D)[^\/?]+)/);
          if (match && match[2]) return match[2];
        }
        return null;
    };

    processAnchorsByHovercard = (root) => { // Copied from content.anchor.test.js setup
      if (!(root instanceof Element)) return;
      const selector = 'a[data-hovercard-url^="/users/"], a[data-octo-click="hovercard-link-click"]';
      let elementsToProcess = [];
      if (root.matches(selector)) elementsToProcess.push(root);
      elementsToProcess.push(...Array.from(root.querySelectorAll(selector)));

      elementsToProcess.forEach(anchor => {
        if (anchor.hasAttribute(PROCESSED_MARKER)) return;
        if (anchor.children.length === 1) {
          const child = anchor.children[0];
          if (child.tagName === "SPAN" && child.classList.contains("AppHeader-context-item-label")) return;
        }
        const username = getUsername(anchor);
        if (!username) return;
        const baseUsername = username.replace(/^@/, "");

        const processUpdateCallback = (userData) => {
          const updated = updateTextNodes(anchor, baseUsername, userData.name); 
          if (updated || !(anchor.textContent.includes(baseUsername) || anchor.textContent.includes(`@${baseUsername}`))) { 
            // Mark processed if updated OR if original username token is no longer found
             anchor.setAttribute(PROCESSED_MARKER, "true");
          }
        };

        if (displayNames[baseUsername] && displayNames[baseUsername].name !== undefined) {
          processUpdateCallback(displayNames[baseUsername]);
        } else {
          registerElement(baseUsername, processUpdateCallback);
          fetchDisplayName(baseUsername);
        }
      });
    };
    
    processProjectElements = (root) => { // Copied from content.projects.test.js setup
        if (!(root instanceof Element)) return;
        const avatarSelector = 'img[data-testid="github-avatar"]';
        let avatarsToProcess = [];
        if (root.matches(avatarSelector)) avatarsToProcess.push(root);
        avatarsToProcess.push(...Array.from(root.querySelectorAll(avatarSelector)));
        avatarsToProcess = Array.from(new Set(avatarsToProcess));
        avatarsToProcess.forEach(avatarElement => {
            let hElement = null;
            const iconWrapper = avatarElement.parentElement;
            const leadingVisualWrapper = iconWrapper ? iconWrapper.parentElement : null;
            const mainContentWrapper = leadingVisualWrapper && leadingVisualWrapper.nextElementSibling ? leadingVisualWrapper.nextElementSibling : null;
            if (mainContentWrapper) hElement = mainContentWrapper.querySelector("h1, h2, h3, h4, h5, h6");
            if (!hElement) { const li = avatarElement.closest("li"); if (li) hElement = li.querySelector("h1, h2, h3, h4, h5, h6");}
            if (!hElement) { /* 3-parent fallback ... */ } // Simplified for brevity, full in projects.test.js
            if (!hElement || hElement.hasAttribute(PROCESSED_MARKER)) return;
            const username = hElement.textContent.trim();
            if (!username || username === "No Assignees" || username === "") return;
            const baseUsername = username.replace(/^@/, "");
            const processUpdateCallback = (userData) => {
                const hUpdated = updateTextNodes(hElement, baseUsername, userData.name);
                if (hUpdated) hElement.setAttribute(PROCESSED_MARKER, "true");
                if (avatarElement.alt !== `@${userData.name}`) avatarElement.alt = `@${userData.name}`;
            };
            if (displayNames[baseUsername] && displayNames[baseUsername].name !== undefined) {
                processUpdateCallback(displayNames[baseUsername]);
            } else {
                registerElement(baseUsername, processUpdateCallback);
                fetchDisplayName(baseUsername);
            }
        });
    };
    // --- End of common setup ---
  });

  beforeEach(() => {
    displayNames = {};
    elementsByUsername = {};
    lastRegisteredCallback = null;
    
    global.chrome.runtime.sendMessage.mockClear();
    global.fetch.mockClear(); // Clear fetch mock calls
    if (fetchDisplayName.mockClear) fetchDisplayName.mockClear();

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = "";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("running processAnchorsByHovercard twice on the same anchor should not duplicate display name", async () => {
    // Mock global.fetch for this specific test
    global.fetch.mockImplementation((url) => {
        if (url.includes("/TBBle")) {
            return Promise.resolve({
                ok: true,
                text: () => Promise.resolve('<html><body><div class="vcard-fullname">Paul "TBBle" Hampson</div></body></html>')
            });
        }
        return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("Not Found") });
    });

    const anchor = document.createElement("a");
    anchor.setAttribute("data-hovercard-url", "/users/TBBle");
    anchor.textContent = "Hello @TBBle!";
    document.body.appendChild(anchor);

    // First run
    processAnchorsByHovercard(document.body); 
    // Let the mocked fetchDisplayName trigger the callback via updateElements
    await flushPromises(); // Ensure fetchDisplayName promise chain resolves
    await new Promise(r => setTimeout(r, 0)); // Additional tick for updateElements if it's also async

    expect(anchor.textContent).toBe('Hello @Paul "TBBle" Hampson!');
    expect(anchor.getAttribute(PROCESSED_MARKER)).toBe("true");

    // Second run - should not change anything due to PROCESSED_MARKER or updateTextNodes internal check
    // Reset lastRegisteredCallback for the second run, though it shouldn't be called if marker works
    lastRegisteredCallback = null; 
    // fetchDisplayName should not be called again for TBBle because displayNames cache now has TBBle,
    // Our fetchDisplayName mock (already a jest.fn()) tracks its calls.
    // Clear any previous calls to ensure we're checking only for the second run.
    fetchDisplayName.mockClear();

    processAnchorsByHovercard(document.body); // Call processing again

    // No manual callback invocation here, rely on cache or marker
    await flushPromises();
    await new Promise(r => setTimeout(r, 0));

    expect(anchor.textContent).toBe('Hello @Paul "TBBle" Hampson!'); // Still the same
    
    // processAnchorsByHovercard should check the PROCESSED_MARKER and not call fetchDisplayName again.
    // Also, fetchDisplayName itself checks the displayNames cache.
    expect(fetchDisplayName).not.toHaveBeenCalled(); 
  });

  test("data-ghu-processed attribute should prevent re-processing for project elements", async () => {
    const username = "projectUser1";
    const { heading, rootElement } = setupPrimaryDOM(username, "h3", `@${username}`);
    heading.setAttribute(PROCESSED_MARKER, "true"); // Mark as already processed

    processProjectElements(rootElement); // Pass the specific root element
    await flushPromises();

    expect(heading.textContent).toBe(username); // Should not have changed to display name
    expect(fetchDisplayName).not.toHaveBeenCalledWith(username);
  });
});
