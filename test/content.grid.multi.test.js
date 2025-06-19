// content.grid.multi.test.js

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Grid Cell Processing - Multi User", () => {
  // --- Start of common setup for content.js testing ---
  let displayNames = {};
  let elementsByUsername = {};
  let lastRegisteredCallbacks = {}; // Store by username for multi-fetch scenarios
  let fetchDisplayName;
  let registerElement;
  let updateElements;
  let updateTextNodes;
  let processMultiUserGridCell; // Specific function for this test suite

  const PROCESSED_MARKER = "data-ghu-processed";
  const CACHE_KEY = "githubDisplayNameCache";

  const mockDisplayNamesForFetch = {
    gridUser1: "Grid User One",
    gridUser2: "Grid User Two",
    gridUser3: "Grid User Three",
  };

  function setupGridCellDOM(usernames, type) { // Keep existing DOM setup
    const cell = document.createElement("div");
    cell.setAttribute("role", "gridcell");
    const innerDiv = document.createElement("div"); // content.js might query relative to this
    cell.appendChild(innerDiv);

    if (type === "multi") {
      if (!Array.isArray(usernames)) throw new Error("For 'multi' type, usernames must be an array.");

      const multiUserSpan = document.createElement("span");
      multiUserSpan.setAttribute("data-avatar-count", usernames.length.toString());
      innerDiv.appendChild(multiUserSpan); // Append to innerDiv

      const avatarImgs = [];
      usernames.forEach((username) => {
        const img = document.createElement("img");
        img.setAttribute("data-testid", "github-avatar");
        img.setAttribute("alt", `@${username}`); // Alt usually has @ prefix
        img.setAttribute("src", "#");
        multiUserSpan.appendChild(img); // Images are children of multiUserSpan
        avatarImgs.push(img);
      });

      // The usernamesTextSpan is typically a sibling of multiUserSpan, or sibling of its parent
      // For testing, let's make it a sibling of multiUserSpan, inside innerDiv
      const usernamesTextSpan = document.createElement("span");
      let initialText = "";
      if (usernames.length === 1) initialText = usernames[0];
      else if (usernames.length === 2) initialText = `${usernames[0]} and ${usernames[1]}`;
      else initialText = usernames.slice(0, -1).join(", ") + ", and " + usernames[usernames.length - 1];
      usernamesTextSpan.textContent = initialText;
      innerDiv.appendChild(usernamesTextSpan);
      
      document.body.appendChild(cell);
      return { cell, multiUserSpan, avatarImgs, usernamesTextSpan };
    } else {
      throw new Error("This test suite is for 'multi' type cells.");
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
      const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?<!\\w)@?${escapedUsername}(?!\\w)`, "gi");
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      let changed = false;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes(nameToDisplay) && !node.textContent.match(regex) ) continue; // only skip if name is there AND old username isn't
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
      const cbsToRun = [...callbacks]; // Iterate over a copy
      elementsByUsername[username] = []; // Clear callbacks for this username
      cbsToRun.forEach(cb => {
        try { cb(userData); } catch (e) { console.error("Error in callback for @" + username, e); }
      });
    };

    registerElement = (username, cb) => {
      if (!elementsByUsername[username]) elementsByUsername[username] = [];
      elementsByUsername[username].push(cb);
      lastRegisteredCallbacks[username] = cb; // Store per username
    };

    fetchDisplayName = jest.fn(async (username) => {
        if (displayNames[username] && displayNames[username].name !== undefined) {
             updateElements(username); return;
        }
        try {
            const fetchedName = mockDisplayNamesForFetch[username] || username;
            let effectiveName = (fetchedName === null || fetchedName.trim() === '') ? username : fetchedName;
            displayNames[username] = { name: effectiveName, timestamp: Date.now(), noExpire: false };
            await global.chrome.runtime.sendMessage({
                type: "releaseLock", origin: global.location.hostname,
                username: username, displayName: effectiveName
            });
            updateElements(username);
        } catch (err) {
            console.error("Error fetching display name for @" + username, err);
            displayNames[username] = { name: username, timestamp: Date.now(), noExpire: true };
            updateElements(username);
        }
    });

    processMultiUserGridCell = (rootNode) => {
        if (!(rootNode instanceof Element)) return;
        let cellsToProcess = [];
        if (rootNode.matches('div[role="gridcell"]')) cellsToProcess.push(rootNode);
        cellsToProcess.push(...Array.from(rootNode.querySelectorAll('div[role="gridcell"]')));
        const uniqueCells = Array.from(new Set(cellsToProcess));

        uniqueCells.forEach((cell) => {
            if (cell.hasAttribute(PROCESSED_MARKER)) return;
            const multiUserSpan = cell.querySelector("span[data-avatar-count]");
            if (!multiUserSpan) return;
            const avatarImgs = Array.from(multiUserSpan.querySelectorAll('img[data-testid="github-avatar"]'));
            if (avatarImgs.length === 0) return;
            
            let usernamesTextSpan = multiUserSpan.nextElementSibling; // Common case
            if (!usernamesTextSpan || usernamesTextSpan.tagName !== "SPAN") {
                 // Fallback based on test DOM structure: sibling of parent if multiUserSpan is wrapped
                 if (multiUserSpan.parentElement && multiUserSpan.parentElement.nextElementSibling && multiUserSpan.parentElement.nextElementSibling.tagName === "SPAN") {
                    usernamesTextSpan = multiUserSpan.parentElement.nextElementSibling;
                 } else if (multiUserSpan.parentElement && multiUserSpan.parentElement.parentElement){ // Or parent of parent
                    usernamesTextSpan = multiUserSpan.parentElement.parentElement.querySelector('span:not([data-avatar-count])');
                 }
            }
            if (!usernamesTextSpan || usernamesTextSpan.tagName !== "SPAN") return;

            let processedAtLeastOneUser = false;
            const usernamesToFetch = new Set();
            avatarImgs.forEach(img => {
                const username = img.alt ? img.alt.replace("@", "").trim() : null;
                if (username) usernamesToFetch.add(username);
            });
            if (usernamesToFetch.size === 0) return;

            usernamesToFetch.forEach(username => {
                processedAtLeastOneUser = true;
                const processUpdateCallback = (userData) => {
                    avatarImgs.forEach(img => {
                        const originalAlt = img.alt ? img.alt.replace("@", "").trim() : null;
                        if (originalAlt === username) {
                            if (img.alt !== `@${userData.name}`) img.alt = `@${userData.name}`;
                        }
                    });
                    updateTextNodes(usernamesTextSpan, username, userData.name);
                };

                if (displayNames[username] && displayNames[username].name !== undefined) {
                    processUpdateCallback(displayNames[username]);
                } else {
                    registerElement(username, processUpdateCallback);
                    fetchDisplayName(username);
                }
            });
            if (processedAtLeastOneUser) cell.setAttribute(PROCESSED_MARKER, "true");
        });
    };
  });

  beforeEach(() => {
    displayNames = {};
    elementsByUsername = {};
    lastRegisteredCallbacks = {};
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

  describe("processMultiUserGridCell", () => {
    test("Basic Multi-User (3 users): should update alts and text span", async () => {
      const users = ["gridUser1", "gridUser2", "gridUser3"];
      const { cell, avatarImgs, usernamesTextSpan } = setupGridCellDOM(users, "multi");

      processMultiUserGridCell(document.body);

      for (const user of users) {
        if (lastRegisteredCallbacks[user]) {
          const userData = { name: mockDisplayNamesForFetch[user], timestamp: Date.now(), noExpire: false };
          lastRegisteredCallbacks[user](userData);
        }
      }
      await flushPromises();
      
      expect(avatarImgs[0].alt).toBe(`@${mockDisplayNamesForFetch.gridUser1}`);
      expect(avatarImgs[1].alt).toBe(`@${mockDisplayNamesForFetch.gridUser2}`);
      expect(avatarImgs[2].alt).toBe(`@${mockDisplayNamesForFetch.gridUser3}`);
      expect(usernamesTextSpan.textContent).toBe(
        `${mockDisplayNamesForFetch.gridUser1}, ${mockDisplayNamesForFetch.gridUser2}, and ${mockDisplayNamesForFetch.gridUser3}`
      );
      expect(cell.hasAttribute(PROCESSED_MARKER)).toBe(true);
    });

    test("Multi-User (2 users): should update alts and text span correctly", async () => {
      const users = ["gridUser1", "gridUser2"];
      const { avatarImgs, usernamesTextSpan } = setupGridCellDOM(users, "multi");
      processMultiUserGridCell(document.body);
      for (const user of users) {
        if (lastRegisteredCallbacks[user]) {
          lastRegisteredCallbacks[user]({ name: mockDisplayNamesForFetch[user], timestamp: Date.now(), noExpire: false });
        }
      }
      await flushPromises();
      expect(avatarImgs[0].alt).toBe(`@${mockDisplayNamesForFetch.gridUser1}`);
      expect(avatarImgs[1].alt).toBe(`@${mockDisplayNamesForFetch.gridUser2}`);
      expect(usernamesTextSpan.textContent).toBe(`${mockDisplayNamesForFetch.gridUser1} and ${mockDisplayNamesForFetch.gridUser2}`);
    });

    test("Multi-User (1 user in multi-cell structure): should update alt and text span", async () => {
      const users = ["gridUser1"];
      const { avatarImgs, usernamesTextSpan } = setupGridCellDOM(users, "multi");
      processMultiUserGridCell(document.body);
      if (lastRegisteredCallbacks.gridUser1) {
        lastRegisteredCallbacks.gridUser1({ name: mockDisplayNamesForFetch.gridUser1, timestamp: Date.now(), noExpire: false });
      }
      await flushPromises();
      expect(avatarImgs[0].alt).toBe(`@${mockDisplayNamesForFetch.gridUser1}`);
      expect(usernamesTextSpan.textContent).toBe(mockDisplayNamesForFetch.gridUser1);
    });

    test("Already Processed (Multi-User): should not re-process", async () => {
      const users = ["gridUser1", "gridUser2"];
      const { cell, avatarImgs, usernamesTextSpan } = setupGridCellDOM(users, "multi");
      cell.setAttribute(PROCESSED_MARKER, "true");

      const initialAltUser1 = avatarImgs[0].alt;
      const initialText = usernamesTextSpan.textContent;

      processMultiUserGridCell(document.body);
      await flushPromises();

      expect(avatarImgs[0].alt).toBe(initialAltUser1);
      expect(usernamesTextSpan.textContent).toBe(initialText);
      expect(fetchDisplayName).not.toHaveBeenCalled();
    });

    test("Dynamic Addition (Multi-User): should process dynamically added cells", async () => {
      // Simulates adding the cell after initial page load / script run
      const users = ["gridUser2", "gridUser3"];
      const { avatarImgs, usernamesTextSpan } = setupGridCellDOM(users, "multi");
      
      processMultiUserGridCell(document.body); // Process the newly added cell

      for (const user of users) {
        if (lastRegisteredCallbacks[user]) {
          lastRegisteredCallbacks[user]({ name: mockDisplayNamesForFetch[user], timestamp: Date.now(), noExpire: false });
        }
      }
      await flushPromises();
      await new Promise(r => setTimeout(r, 0)); // Ensure microtasks and potential chained promises resolve

      expect(avatarImgs[0].alt).toBe(`@${mockDisplayNamesForFetch.gridUser2}`);
      expect(avatarImgs[1].alt).toBe(`@${mockDisplayNamesForFetch.gridUser3}`);
      expect(usernamesTextSpan.textContent).toBe(`${mockDisplayNamesForFetch.gridUser2} and ${mockDisplayNamesForFetch.gridUser3}`);
    });
  });
});
