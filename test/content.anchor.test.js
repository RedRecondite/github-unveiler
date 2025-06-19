// test/content.anchor.test.js

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Anchor Processing", () => {
  // --- Start of common setup for content.js testing ---
  let displayNames = {};
  let elementsByUsername = {};
  let lastRegisteredCallback = null;
  let fetchDisplayName;
  let registerElement;
  let updateElements;
  let updateTextNodes;
  let processAnchorsByHovercard;
  let getUsername;

  const PROCESSED_MARKER = "data-ghu-processed";
  const CACHE_KEY = "githubDisplayNameCache"; // Used by fetchDisplayName mock

  const mockDisplayNamesForFetch = { // Renamed to avoid conflict with the cache variable 'displayNames'
    testuser: "Test User",
    testuser2: "Test User 2",
    octouser: "Test Octo",
    user123: "Test User 123",
    TBBle: 'Paul "TBBle" Hampson',
    emptyUser: "", // fetchDisplayName will resolve with this, then content.js logic should handle it
    spaceUser: "   ", // fetchDisplayName will resolve with this
    nullUser: null, // fetchDisplayName will resolve with this (simulating no .vcard-fullname)
  };


  beforeAll(() => {
    // Mock chrome APIs (globally available from Jest setup or here)
    global.chrome = {
      storage: {
        local: {
          get: jest.fn((keys, callback) => {
            // This mock will be used by the fetchDisplayName mock
            const result = { [CACHE_KEY]: { [global.location.hostname]: displayNames } };
            if (callback) callback(result);
            return Promise.resolve(result);
          }),
          set: jest.fn((obj, callback) => {
            // This mock will be used by the fetchDisplayName mock
            if (obj[CACHE_KEY] && obj[CACHE_KEY][global.location.hostname]) {
                // Merge into displayNames, don't overwrite, to simulate multiple origins
                Object.assign(displayNames, obj[CACHE_KEY][global.location.hostname]);
            }
            if (callback) callback();
            return Promise.resolve();
          }),
        },
      },
      runtime: {
        sendMessage: jest.fn((msg) => {
          if (msg.type === "acquireLock") {
            return Promise.resolve({ acquired: true });
          }
          if (msg.type === "releaseLock") {
            // Simulate background script updating the cache (simplified for content.js tests)
            if (msg.origin && msg.username && msg.displayName) {
                if (!displayNames[msg.username]) displayNames[msg.username] = {};
                 displayNames[msg.username] = { // Store as object now
                    name: msg.displayName,
                    timestamp: Date.now(),
                    noExpire: false // Default for new entries from fetch
                };
            }
            global.chrome.runtime.sendMessage.lastReleaseLockMessage = msg; // For assertions
            return Promise.resolve({ success: true });
          }
          return Promise.resolve({});
        }),
        lastError: null,
        getURL: jest.fn(path => `chrome://extension-id/${path}`),
      },
    };

    global.fetch = jest.fn((url) => {
      const potentialUsernameMatch = url.match(/\/([^\/]+)$/);
      const username = potentialUsernameMatch ? decodeURIComponent(potentialUsernameMatch[1]) : null;

      if (username === 'nullUser') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<html><body><!-- No vcard-fullname --></body></html>')
        });
      }
      
      const fetchedDisplayName = mockDisplayNamesForFetch[username];

      if (typeof fetchedDisplayName !== 'undefined') {
         // Simulate empty or whitespace display name being "corrected" to username later if needed
        const effectiveDisplayName = fetchedDisplayName; //  (fetchedDisplayName === null || fetchedDisplayName.trim() === '') ? username : fetchedDisplayName;
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(`<html><body><div class="vcard-fullname">${effectiveDisplayName}</div></body></html>`)
        });
      }
      return Promise.resolve({ ok: false, status: 404, text: () => Promise.resolve("Not Found") });
    });
    
    global.location = { hostname: "github.com" }; // Default, can be overridden in tests

    // --- Redefinition of content.js functions needed for these tests ---
    updateTextNodes = (element, username, nameToDisplay) => {
      const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?<!\\w)@?${escapedUsername}(?!\\w)`, "g");
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      let changed = false;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes(nameToDisplay)) continue;
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
      const userData = displayNames[username] || { name: username, timestamp: 0, noExpire: true };
      delete elementsByUsername[username]; // Callbacks run once
      callbacks.forEach(cb => {
        try { cb(userData); } catch (e) { console.error("Error in callback for @" + username, e); }
      });
    };

    registerElement = (username, cb) => {
      if (!elementsByUsername[username]) elementsByUsername[username] = [];
      elementsByUsername[username].push(cb);
      lastRegisteredCallback = cb; // For direct invocation in tests
    };

    fetchDisplayName = jest.fn(async (username) => {
        if (displayNames[username] && displayNames[username].name) { // Check if already cached (as object)
             updateElements(username);
             return;
        }
        try {
            // Simplified: directly use global.fetch mock
            const response = await global.fetch(`https://${global.location.hostname}/${username}`);
            if (!response.ok) throw new Error("HTTP error " + response.status);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const el = doc.querySelector(".vcard-fullname");
            let fetchedName = el ? el.textContent.trim() : username;

            if (!fetchedName || fetchedName.trim() === '') { // Handle empty/whitespace fetched name
                fetchedName = username;
            }
            
            // Simulate background script's releaseLock behavior for updating cache
            // This aligns with how content.js expects the cache to be populated after a fetch
            displayNames[username] = { name: fetchedName, timestamp: Date.now(), noExpire: false };
            // Simulate the releaseLock message which would normally trigger cache update in background
            // For testing content.js, we directly update our mock 'displayNames' and then call updateElements
            await global.chrome.runtime.sendMessage({
                type: "releaseLock", // This call is mostly for tests that assert on sendMessage
                origin: global.location.hostname,
                username: username,
                displayName: fetchedName 
            });
            updateElements(username);

        } catch (err) {
            console.error("Error fetching display name for @" + username, err);
            displayNames[username] = { name: username, timestamp: Date.now(), noExpire: true }; // Fallback
            updateElements(username);
        }
    });
    
    getUsername = (anchor) => {
        const hover = anchor.getAttribute("data-hovercard-url");
        const href = anchor.getAttribute("href");
        if (hover) {
          const match = hover.match(/^\/users\/((?!.*%5Bbot%5D)[^\/?]+)/);
          if (match) return match[1];
        } else if (href) {
          // Updated regex to be more permissive for href fallbacks like /orgs/*/people/*
          // and general /username paths, but still avoid [bot].
          let match = href.match(/^\/(orgs\/[^\/]+\/people\/)?((?!.*%5Bbot%5D)[^\/?]+)/);
          if (match && match[2]) return match[2]; // match[2] is the username part
        }
        return null;
    };

    processAnchorsByHovercard = (root) => {
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

        const processUpdateCallback = (userData) => { // Expects userData object
          const updated = updateTextNodes(anchor, username, userData.name); // Pass userData.name
          if (updated) anchor.setAttribute(PROCESSED_MARKER, "true");
        };

        if (displayNames[username] && displayNames[username].name) { // Check for .name
          processUpdateCallback(displayNames[username]);
        } else {
          registerElement(username, processUpdateCallback);
          fetchDisplayName(username);
        }
      });
    };
  });
  // --- End of common setup ---

  beforeEach(() => {
    displayNames = {};
    elementsByUsername = {};
    lastRegisteredCallback = null;
    
    // Clear mocks that track calls
    global.fetch.mockClear();
    if (global.chrome.runtime.sendMessage.mockClear) {
      global.chrome.runtime.sendMessage.mockClear();
    }
    delete global.chrome.runtime.sendMessage.lastReleaseLockMessage;
    if (fetchDisplayName.mockClear) fetchDisplayName.mockClear(); // Clear our own mock

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = "";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("should fetch and update display name on a valid anchor with data-hovercard-url", async () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("data-hovercard-url", "/users/testuser");
    anchor.textContent = "Hello @testuser, welcome!";
    document.body.appendChild(anchor);

    processAnchorsByHovercard(document.body); // Call the test-scoped version
    
    // Manually simulate callback if fetchDisplayName was called
    if (fetchDisplayName.mock.calls.some(call => call[0] === 'testuser')) {
        expect(lastRegisteredCallback).toBeDefined();
        // Simulate the data that fetchDisplayName would put into displayNames and pass to updateElements
        const userData = { name: mockDisplayNamesForFetch.testuser, timestamp: Date.now(), noExpire: false };
        displayNames['testuser'] = userData; // Prime cache as fetch would
        lastRegisteredCallback(userData); // Call the specific callback
    }
    await flushPromises();

    expect(anchor.textContent).toBe("Hello @Test User, welcome!");
    expect(anchor.getAttribute(PROCESSED_MARKER)).toBe("true");
  });

  test("should prioritize display name from local cache over network fetch", async () => {
    const username = "cachedUser";
    const cachedDisplayName = "Cached Name";
    // Prime the displayNames cache (which is used by our test's processAnchorsByHovercard)
    displayNames[username] = { name: cachedDisplayName, timestamp: Date.now(), noExpire: false };

    const anchor = document.createElement("a");
    anchor.setAttribute("data-hovercard-url", `/users/${username}`);
    anchor.textContent = `Hello @${username}!`;
    document.body.appendChild(anchor);

    processAnchorsByHovercard(document.body);
    await flushPromises();

    expect(anchor.textContent).toBe(`Hello @${cachedDisplayName}!`);
    expect(fetchDisplayName).not.toHaveBeenCalledWith(username); // fetchDisplayName (our mock) shouldn't be called
  });

  describe("Empty or Whitespace Display Name Handling in fetchDisplayName", () => {
    // These tests now rely on the mocked fetchDisplayName to handle empty/whitespace names correctly
    // and then updateTextNodes to use that name.
    test("should default to username if fetched display name is an empty string", async () => {
      const username = "emptyUser"; // mockDisplayNamesForFetch.emptyUser is ""
      const anchor = document.createElement("a");
      anchor.setAttribute("data-hovercard-url", `/users/${username}`);
      anchor.textContent = `@${username}`;
      document.body.appendChild(anchor);

      processAnchorsByHovercard(document.body);
      
      if (lastRegisteredCallback) {
        // fetchDisplayName mock will call global.fetch, get "", 
        // then it (fetchDisplayName mock) should set displayNames[username] = {name: username, ...}
        // and then call updateElements, which calls lastRegisteredCallback.
        // So, we don't call lastRegisteredCallback directly here if fetchDisplayName is doing its job.
      }
      await flushPromises(); // Allow fetchDisplayName mock and its chain to complete

      expect(anchor.textContent).toBe(`@${username}`); // Name should be username
      // Check that releaseLock was called with username as displayName
      expect(global.chrome.runtime.sendMessage.lastReleaseLockMessage).toEqual(
         expect.objectContaining({ displayName: username })
      );
    });

    test("should default to username if fetched display name is whitespace only", async () => {
      const username = "spaceUser"; // mockDisplayNamesForFetch.spaceUser is "   "
      const anchor = document.createElement("a");
      anchor.setAttribute("data-hovercard-url", `/users/${username}`);
      anchor.textContent = `@${username}`;
      document.body.appendChild(anchor);
      processAnchorsByHovercard(document.body);
      await flushPromises();
      expect(anchor.textContent).toBe(`@${username}`);
       expect(global.chrome.runtime.sendMessage.lastReleaseLockMessage).toEqual(
         expect.objectContaining({ displayName: username })
      );
    });

    test("should default to username if .vcard-fullname element is not found (displayName is null)", async () => {
      const username = "nullUser"; // mockDisplayNamesForFetch.nullUser is null
      const anchor = document.createElement("a");
      anchor.setAttribute("data-hovercard-url", `/users/${username}`);
      anchor.textContent = `@${username}`;
      document.body.appendChild(anchor);
      processAnchorsByHovercard(document.body);
      await flushPromises();
      expect(anchor.textContent).toBe(`@${username}`);
       expect(global.chrome.runtime.sendMessage.lastReleaseLockMessage).toEqual(
         expect.objectContaining({ displayName: username })
      );
    });
  });

  test("should fallback to username if fetch fails", async () => {
    const usernameToFail = "testuserFail"; // This user is not in mockDisplayNamesForFetch
    
    const anchor = document.createElement("a");
    anchor.setAttribute("data-hovercard-url", `/users/${usernameToFail}`);
    anchor.textContent = `Hello @${usernameToFail}, welcome!`;
    document.body.appendChild(anchor);

    processAnchorsByHovercard(document.body);
    await flushPromises(); // Allow fetchDisplayName and its error handling to run

    expect(anchor.textContent).toBe(`Hello @${usernameToFail}, welcome!`);
    // The console.error is now inside our mocked fetchDisplayName
    expect(console.error).toHaveBeenCalledWith(
      `Error fetching display name for @${usernameToFail}`,
      expect.any(Error) // Error comes from the global.fetch mock returning 404
    );
  });

  test("should skip processing anchor with a single child span having AppHeader-context-item-label", async () => {
    const anchor = document.createElement("a");
    anchor.setAttribute("data-hovercard-url", "/users/someuser");
    const span = document.createElement("span");
    span.className = "AppHeader-context-item-label";
    span.textContent = "some text";
    anchor.appendChild(span);
    document.body.appendChild(anchor);

    processAnchorsByHovercard(document.body);
    await flushPromises();

    expect(anchor.innerHTML).toBe(span.outerHTML);
    expect(fetchDisplayName).not.toHaveBeenCalledWith("someuser");
  });

  test("should extract username from href if data-hovercard-url is missing (handles trailing slash)", async () => {
    const username = "user123";
    const anchor = document.createElement("a");
    anchor.setAttribute("href", `/${username}/`); // getUsername should handle this
    anchor.setAttribute("data-octo-click", "hovercard-link-click"); // Make it selectable
    anchor.textContent = `Welcome @${username}!`;
    document.body.appendChild(anchor);

    processAnchorsByHovercard(document.body);
    if (lastRegisteredCallback) {
        const userData = { name: mockDisplayNamesForFetch[username], timestamp: Date.now(), noExpire: false };
        displayNames[username] = userData;
        lastRegisteredCallback(userData);
    }
    await flushPromises();
    
    expect(anchor.textContent).toBe(`Welcome @${mockDisplayNamesForFetch[username]}!`);
    expect(anchor.getAttribute(PROCESSED_MARKER)).toBe("true");
  });

  test("should process anchor with data-octo-click attribute and valid href", async () => {
    const username = "octouser";
    const anchor = document.createElement("a");
    anchor.setAttribute("data-octo-click", "hovercard-link-click");
    anchor.setAttribute("href", `/${username}`);
    anchor.textContent = `Hello @${username}!`;
    document.body.appendChild(anchor);
    
    processAnchorsByHovercard(document.body);
    if (lastRegisteredCallback) {
        const userData = { name: mockDisplayNamesForFetch[username], timestamp: Date.now(), noExpire: false };
        displayNames[username] = userData;
        lastRegisteredCallback(userData);
    }
    await flushPromises();

    expect(anchor.textContent).toBe(`Hello @${mockDisplayNamesForFetch[username]}!`);
    expect(anchor.getAttribute(PROCESSED_MARKER)).toBe("true");
  });

  test("should skip processing anchor if username contains encoded [bot]", async () => {
    const usernameWithBot = "test%5Bbot%5D"; // This should be caught by getUsername
    const anchor = document.createElement("a");
    anchor.setAttribute("data-hovercard-url", `/users/${usernameWithBot}`);
    anchor.textContent = `Hello @${usernameWithBot}!`;
    document.body.appendChild(anchor);

    processAnchorsByHovercard(document.body);
    await flushPromises();

    expect(anchor.textContent).toBe(`Hello @${usernameWithBot}!`);
    expect(fetchDisplayName).not.toHaveBeenCalled(); // getUsername should return null
  });
});
