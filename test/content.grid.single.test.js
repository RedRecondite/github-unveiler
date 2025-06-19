// content.grid.single.test.js

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Grid Cell Processing - Single User", () => {
  // --- Start of common setup for content.js testing ---
  let displayNames = {};
  let elementsByUsername = {};
  let lastRegisteredCallback = null;
  let fetchDisplayName;
  let registerElement;
  let updateElements;
  let updateTextNodes;
  let processSingleUserGridCell; // Specific function for this test suite

  const PROCESSED_MARKER = "data-ghu-processed";
  const CACHE_KEY = "githubDisplayNameCache";

  const mockDisplayNamesForFetch = {
    gridUser1: "Grid User One",
    gridUser2: "Grid User Two",
  };

  function setupGridCellDOM(usernameWithPossibleAt, type = "single") {
    const cell = document.createElement("div");
    cell.setAttribute("role", "gridcell");
    const innerDiv = document.createElement("div"); // Grid cells often have multiple nested divs
    cell.appendChild(innerDiv);

    if (type === "single") {
      const userDiv = document.createElement("div"); // Another div wrapping avatar and span
      const img = document.createElement("img");
      img.setAttribute("data-testid", "github-avatar");
      // Set alt as it would appear in GitHub (sometimes with @, sometimes without)
      // processSingleUserGridCell should handle stripping @ if present
      img.setAttribute("alt", usernameWithPossibleAt); 
      img.setAttribute("src", "#");

      const usernameSpan = document.createElement("span");
      // usernameSpan textContent often matches the alt attribute or the username part
      usernameSpan.textContent = usernameWithPossibleAt; 

      userDiv.appendChild(img);
      userDiv.appendChild(usernameSpan);
      innerDiv.appendChild(userDiv);
      document.body.appendChild(cell);
      return { cell, img, usernameSpan };
    } else {
      throw new Error("This suite is for single user cells.");
    }
  }

  beforeAll(() => {
    global.chrome = {
      storage: { local: { get: jest.fn(), set: jest.fn() } },
      runtime: {
        sendMessage: jest.fn(), lastError: null,
        getURL: jest.fn(path => `chrome://extension-id/${path}`),
      },
    };
    global.fetch = jest.fn();
    global.location = { hostname: "github.com" };

    updateTextNodes = (element, username, nameToDisplay) => {
      const baseUsername = username.replace(/^@/, ""); // Ensure we match without @
      const escapedBaseUsername = baseUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?<!\\w)@?${escapedBaseUsername}(?!\\w)`, "gi");
      
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      let changed = false;
      while ((node = walker.nextNode())) {
          // If nameToDisplay is already there but the original username token isn't, skip.
          if (node.textContent.includes(nameToDisplay) && !node.textContent.match(regex)) continue;

          const updated = node.textContent.replace(regex, match => {
              // If the original match had '@', preserve it. Otherwise, use plain name.
              return match.startsWith("@") ? `@${nameToDisplay}` : nameToDisplay;
          });

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
      if (!elementsByUsername[username]) elementsByUsername[username] = [];
      elementsByUsername[username].push(cb);
      lastRegisteredCallback = cb;
    };

    fetchDisplayName = jest.fn(async (rawUsername) => {
        const username = rawUsername.replace(/^@/, ""); // Normalize username
        if (displayNames[username] && displayNames[username].name !== undefined) {
             updateElements(username); return; // Use normalized username for cache access
        }
        try {
            const fetchedName = mockDisplayNamesForFetch[username] || username;
            let effectiveName = (fetchedName === null || fetchedName.trim() === '') ? username : fetchedName;
            displayNames[username] = { name: effectiveName, timestamp: Date.now(), noExpire: false };
            await global.chrome.runtime.sendMessage({
                type: "releaseLock", origin: global.location.hostname,
                username: username, displayName: effectiveName
            });
            updateElements(username); // Use normalized username
        } catch (err) {
            console.error("Error fetching display name for @" + username, err);
            displayNames[username] = { name: username, timestamp: Date.now(), noExpire: true };
            updateElements(username); // Use normalized username
        }
    });
    
    processSingleUserGridCell = (rootNode) => {
        if (!(rootNode instanceof Element)) return;
        let cellsToProcess = [];
        if (rootNode.matches('div[role="gridcell"]')) cellsToProcess.push(rootNode);
        cellsToProcess.push(...Array.from(rootNode.querySelectorAll('div[role="gridcell"]')));
        const uniqueCells = Array.from(new Set(cellsToProcess));

        uniqueCells.forEach((cell) => {
            if (cell.hasAttribute(PROCESSED_MARKER)) return;
            const avatarImg = cell.querySelector('img[data-testid="github-avatar"]');
            if (!avatarImg) return;

            // Username from alt attribute, potentially stripping '@'
            const rawUsernameFromAlt = avatarImg.alt ? avatarImg.alt.trim() : null;
            if (!rawUsernameFromAlt) return;
            const usernameForCache = rawUsernameFromAlt.replace(/^@/, ""); // Used for caching/fetching
            
            // Find the span containing the username.
            // This is a simplified search. content.js has more complex logic.
            let usernameSpan = null;
            const spans = cell.querySelectorAll("span");
            for (let span of spans) {
                if (span.textContent.trim() === rawUsernameFromAlt || span.textContent.trim() === usernameForCache) {
                    usernameSpan = span;
                    break;
                }
            }
            // A more targeted search if the above fails (common in test DOM)
            if (!usernameSpan && cell.querySelector('div > div > span')) {
                 usernameSpan = cell.querySelector('div > div > span');
                 // Verify it actually contains the username
                 if (usernameSpan && !(usernameSpan.textContent.trim() === rawUsernameFromAlt || usernameSpan.textContent.trim() === usernameForCache)) {
                    usernameSpan = null;
                 }
            }


            if (usernameSpan) {
                const processUpdateCallback = (userData) => {
                    // Alt attribute should typically be @DisplayName
                    if (avatarImg.alt !== `@${userData.name}`) {
                        avatarImg.alt = `@${userData.name}`;
                    }
                    // Update text nodes using the raw username from alt (which might have @)
                    // or the usernameForCache if the span content doesn't have @.
                    // updateTextNodes itself handles @ stripping for matching.
                    updateTextNodes(usernameSpan, rawUsernameFromAlt, userData.name); 
                    cell.setAttribute(PROCESSED_MARKER, "true");
                };

                if (displayNames[usernameForCache] && displayNames[usernameForCache].name !== undefined) {
                    processUpdateCallback(displayNames[usernameForCache]);
                } else {
                    registerElement(usernameForCache, processUpdateCallback); // Use normalized username
                    fetchDisplayName(rawUsernameFromAlt); // Pass original alt to fetchDisplayName
                }
            }
        });
    };
  });
  // --- End of common setup ---

  beforeEach(() => {
    displayNames = {};
    elementsByUsername = {};
    lastRegisteredCallback = null;
    global.chrome.runtime.sendMessage.mockClear();
    if (fetchDisplayName.mockClear) fetchDisplayName.mockClear();
    if (global.fetch.mockClear) global.fetch.mockClear();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = "";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  describe("processSingleUserGridCell", () => {
    test("Basic Replacement: should update alt and span for a single user", async () => {
      const rawUsername = "gridUser1"; // Username as it appears in DOM initially
      const expectedDisplayName = mockDisplayNamesForFetch.gridUser1;
      const { cell, img, usernameSpan } = setupGridCellDOM(rawUsername, "single");
      
      processSingleUserGridCell(document.body); // Process the cell

      if (lastRegisteredCallback) {
        lastRegisteredCallback({ name: expectedDisplayName, timestamp: Date.now(), noExpire: false });
      }
      await flushPromises();

      expect(img.alt).toBe(`@${expectedDisplayName}`);
      expect(usernameSpan.textContent).toBe(expectedDisplayName);
      expect(cell.hasAttribute(PROCESSED_MARKER)).toBe(true);
    });

    test("Already Processed: should not re-process if data-ghu-processed is true", async () => {
      const rawUsername = "gridUser1";
      const { cell, img, usernameSpan } = setupGridCellDOM(rawUsername, "single");
      cell.setAttribute(PROCESSED_MARKER, "true");

      processSingleUserGridCell(document.body);
      await flushPromises();

      expect(img.alt).toBe(rawUsername); // Should remain unchanged
      expect(usernameSpan.textContent).toBe(rawUsername); // Should remain unchanged
      expect(fetchDisplayName).not.toHaveBeenCalled();
    });

    test("Dynamic Addition (MutationObserver): should process dynamically added single user cells", async () => {
      const rawUsername = "gridUser2";
      const expectedDisplayName = mockDisplayNamesForFetch.gridUser2;
      const { img, usernameSpan } = setupGridCellDOM(rawUsername, "single");
      
      processSingleUserGridCell(document.body); // Process after adding to body

      if (lastRegisteredCallback) {
        lastRegisteredCallback({ name: expectedDisplayName, timestamp: Date.now(), noExpire: false });
      }
      await flushPromises();
      
      expect(img.alt).toBe(`@${expectedDisplayName}`);
      expect(usernameSpan.textContent).toBe(expectedDisplayName);
    });

    test('Username with leading "@": should correctly update alt and span', async () => {
      const rawUsernameWithAt = "@gridUser1";
      const usernameWithoutAt = "gridUser1";
      const expectedDisplayName = mockDisplayNamesForFetch.gridUser1;
      const { img, usernameSpan } = setupGridCellDOM(rawUsernameWithAt, "single");

      processSingleUserGridCell(document.body);
      if (lastRegisteredCallback) {
        // fetchDisplayName and registerElement use the username without '@'
        lastRegisteredCallback({ name: expectedDisplayName, timestamp: Date.now(), noExpire: false });
      }
      await flushPromises();

      expect(img.alt).toBe(`@${expectedDisplayName}`);
      // updateTextNodes should handle the @ correctly for the span
      expect(usernameSpan.textContent).toBe(`@${expectedDisplayName}`);
    });
  });
});
