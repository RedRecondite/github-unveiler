// test/content.boardgroupheader.test.js

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Board Group Header Processing", () => {
  // --- Start of common setup for content.js testing ---
  let displayNames = {};
  let elementsByUsername = {};
  let lastRegisteredCallback = null;
  let fetchDisplayName;
  let registerElement;
  let updateElements;
  let updateTextNodes;
  let processBoardGroupHeader; // Specific function for this test suite

  const PROCESSED_MARKER = "data-ghu-processed";
  const CACHE_KEY = "githubDisplayNameCache";

  const mockDisplayNamesForFetch = {
    boardUser1: "Board User One",
    // Add other users if needed by specific tests in this suite
  };

  // Helper function to set up DOM for board group header tests
  // (Keep existing setupBoardGroupHeaderDOM as it's specific to these tests)
  function setupBoardGroupHeaderDOM(username) {
    const container = document.createElement("div");
    // container.className = "board-group-header-container"; // Outer container for processing
    // The actual processing might target a child of what's passed to processBoardGroupHeader
    // Let's simulate the structure processBoardGroupHeader expects.
    // It queries for "div > span[data-avatar-count] + span"
    // The parent of this structure is what might get the PROCESSED_MARKER.

    const groupHeaderContainer = document.createElement("div"); // This might be what gets marked
    container.appendChild(groupHeaderContainer);


    const headerContentBlock = document.createElement("div"); // Direct parent of avatar count and username span
    groupHeaderContainer.appendChild(headerContentBlock);


    const avatarCountSpan = document.createElement("span");
    avatarCountSpan.setAttribute("data-avatar-count", "1");
    headerContentBlock.appendChild(avatarCountSpan);

    const avatarImg = document.createElement("img");
    avatarImg.setAttribute("data-testid", "github-avatar");
    // In content.js, username is extracted from alt. If alt is initially @username, it's stripped.
    // Let's set it to just 'username' as if it was already stripped or was initially like that.
    avatarImg.setAttribute("alt", username); 
    avatarImg.setAttribute("src", "#");
    avatarCountSpan.appendChild(avatarImg); // Actual image might be deeper, but this is what querySelector looks for

    const usernameSpan = document.createElement("span");
    usernameSpan.textContent = username; // This is what gets updated
    headerContentBlock.appendChild(usernameSpan);
    
    // Tooltips: Assuming they are siblings of groupHeaderContainer or headerContentBlock's parent
    // For simplicity, let's place them as siblings of groupHeaderContainer
    const tooltipCollapse = document.createElement("span");
    tooltipCollapse.setAttribute("popover", "auto");
    tooltipCollapse.id = "tooltip-collapse";
    // Tooltip text must contain the username to be updated.
    tooltipCollapse.textContent = `Collapse group ${username}`; 
    container.appendChild(tooltipCollapse);


    const tooltipActions = document.createElement("span");
    tooltipActions.setAttribute("popover", "auto");
    tooltipActions.id = "tooltip-actions";
    tooltipActions.textContent = `Actions for group: ${username}`;
    container.appendChild(tooltipActions);


    document.body.appendChild(container);

    return {
      container, // The root element passed to processBoardGroupHeader
      avatarImg,
      usernameSpan,
      tooltipCollapse,
      tooltipActions,
      headerContentBlock, // The div containing avatar and username text
      groupHeaderContainer // The element expected to be marked as processed
    };
  }


  beforeAll(() => {
    global.chrome = {
      storage: { local: { get: jest.fn(), set: jest.fn() } }, // Simplified, specific mocks in fetchDisplayName if needed
      runtime: {
        sendMessage: jest.fn(),
        lastError: null,
        getURL: jest.fn(path => `chrome://extension-id/${path}`),
      },
    };
    
    global.fetch = jest.fn(); // Mocked per test or in fetchDisplayName
    global.location = { hostname: "github.com" };

    // --- Redefinition of content.js functions needed for these tests ---
    updateTextNodes = (element, username, nameToDisplay) => {
      const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?<!\\w)@?${escapedUsername}(?!\\w)`, "gi"); // Case-insensitive for tooltips
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
      delete elementsByUsername[username];
      callbacks.forEach(cb => {
        try { cb(userData); } catch (e) { console.error("Error in callback for @" + username, e); }
      });
    };

    registerElement = (username, cb) => {
      if (!elementsByUsername[username]) elementsByUsername[username] = [];
      elementsByUsername[username].push(cb);
      lastRegisteredCallback = cb;
    };

    fetchDisplayName = jest.fn(async (username) => {
        if (displayNames[username] && displayNames[username].name !== undefined) {
             updateElements(username);
             return;
        }
        try {
            // Simulate fetch using mockDisplayNamesForFetch
            const fetchedName = mockDisplayNamesForFetch[username] || username;
            let effectiveName = fetchedName;
            if (fetchedName === null || fetchedName.trim() === '') {
                effectiveName = username;
            }
            
            displayNames[username] = { name: effectiveName, timestamp: Date.now(), noExpire: false };
            // Simulate background interaction for cache update (simplified)
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

    processBoardGroupHeader = (root) => {
        if (!(root instanceof Element)) return;
        const headerContentBlocks = root.querySelectorAll("div > span[data-avatar-count] + span");

        headerContentBlocks.forEach((usernameTextSpan) => {
            const avatarCountSpan = usernameTextSpan.previousElementSibling;
            if (!avatarCountSpan || !avatarCountSpan.hasAttribute("data-avatar-count")) return;
            const avatarImg = avatarCountSpan.querySelector('img[data-testid="github-avatar"]');
            if (!avatarImg) return;

            const headerContentBlock = avatarCountSpan.parentElement; // This is div.header-content-block
            if (!headerContentBlock || headerContentBlock.tagName !== "DIV") return;
            
            // containerToMark is often headerContentBlock.parentElement in this DOM structure
            const containerToMark = headerContentBlock.parentElement; 
            if (!containerToMark || containerToMark.hasAttribute(PROCESSED_MARKER)) return;

            const username = avatarImg.alt ? avatarImg.alt.replace("@", "").trim() : null;
            if (!username) return;

            const tooltipSpans = [];
            // Simplified tooltip search based on provided DOM structure (siblings of containerToMark)
            if (containerToMark.parentElement) {
                 Array.from(containerToMark.parentElement.querySelectorAll('span[popover="auto"]')).forEach(tip => {
                    const text = tip.textContent.toLowerCase();
                    if ((text.startsWith("collapse group") || text.startsWith("actions for group")) && text.includes(username.toLowerCase())) {
                        tooltipSpans.push(tip);
                    }
                });
            }


            const processUpdateCallback = (userData) => {
                if (avatarImg.alt !== `@${userData.name}`) {
                  avatarImg.alt = `@${userData.name}`;
                }
                updateTextNodes(usernameTextSpan, username, userData.name);

                tooltipSpans.forEach((tooltipSpan) => {
                  const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                  const regex = new RegExp(escapedUsername, "gi");
                  if (tooltipSpan.textContent.match(regex)) {
                    tooltipSpan.textContent = tooltipSpan.textContent.replace(regex, userData.name);
                  }
                });
                containerToMark.setAttribute(PROCESSED_MARKER, "true");
            };

            if (displayNames[username] && displayNames[username].name !== undefined) {
                processUpdateCallback(displayNames[username]);
            } else {
                registerElement(username, processUpdateCallback);
                fetchDisplayName(username);
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

  describe("processBoardGroupHeader", () => {
    test("Basic Replacement: should update avatar, username span, and tooltips", async () => {
      const username = "boardUser1";
      const { container, avatarImg, usernameSpan, tooltipCollapse, tooltipActions, groupHeaderContainer } = 
        setupBoardGroupHeaderDOM(username);

      processBoardGroupHeader(container); // Process the outer container where elements are found

      if (lastRegisteredCallback) {
        const userData = { name: mockDisplayNamesForFetch[username], timestamp: Date.now(), noExpire: false };
        // displayNames[username] = userData; // fetchDisplayName mock does this
        lastRegisteredCallback(userData);
      }
      await flushPromises();

      expect(avatarImg.alt).toBe(`@${mockDisplayNamesForFetch[username]}`);
      expect(usernameSpan.textContent).toBe(mockDisplayNamesForFetch[username]);
      expect(tooltipCollapse.textContent).toBe(`Collapse group ${mockDisplayNamesForFetch[username]}`);
      expect(tooltipActions.textContent).toBe(`Actions for group: ${mockDisplayNamesForFetch[username]}`);
      expect(groupHeaderContainer.hasAttribute(PROCESSED_MARKER)).toBe(true);
    });

    test("Already Processed: should not re-process if container is marked", async () => {
      const username = "boardUser1";
      const { container, avatarImg, usernameSpan, tooltipCollapse, tooltipActions, groupHeaderContainer } = 
        setupBoardGroupHeaderDOM(username);
      
      groupHeaderContainer.setAttribute(PROCESSED_MARKER, "true");

      const originalAlt = avatarImg.alt;
      const originalUsernameText = usernameSpan.textContent;
      const originalCollapseTooltip = tooltipCollapse.textContent;
      const originalActionsTooltip = tooltipActions.textContent;

      processBoardGroupHeader(container);
      await flushPromises();

      expect(avatarImg.alt).toBe(originalAlt); // Should not change from initial username
      expect(usernameSpan.textContent).toBe(originalUsernameText);
      expect(tooltipCollapse.textContent).toBe(originalCollapseTooltip);
      expect(tooltipActions.textContent).toBe(originalActionsTooltip);
      expect(fetchDisplayName).not.toHaveBeenCalledWith(username);
    });

    test("Dynamic Addition: should process dynamically added board group headers", async () => {
      // This test implies MutationObserver, which is not directly tested here.
      // We test if calling processBoardGroupHeader on new content works.
      const username = "boardUser1";
      const { container, avatarImg, usernameSpan, tooltipCollapse, tooltipActions, groupHeaderContainer } = 
        setupBoardGroupHeaderDOM(username);
      
      // Simulate it being new content by not calling process before this
      processBoardGroupHeader(container); 

      if (lastRegisteredCallback) {
        const userData = { name: mockDisplayNamesForFetch[username], timestamp: Date.now(), noExpire: false };
        lastRegisteredCallback(userData);
      }
      await flushPromises();
      // Wait for any internal async operations in the processing if there were any
      await new Promise(r => setTimeout(r, 0));


      expect(avatarImg.alt).toBe(`@${mockDisplayNamesForFetch[username]}`);
      expect(usernameSpan.textContent).toBe(mockDisplayNamesForFetch[username]);
      expect(tooltipCollapse.textContent).toBe(`Collapse group ${mockDisplayNamesForFetch[username]}`);
      expect(tooltipActions.textContent).toBe(`Actions for group: ${mockDisplayNamesForFetch[username]}`);
      expect(groupHeaderContainer.hasAttribute(PROCESSED_MARKER)).toBe(true);
    });

    test("Tooltip Not Updated if Username Absent: only relevant tooltips change", async () => {
      const username = "boardUser1";
      const { container, avatarImg, usernameSpan, tooltipCollapse, tooltipActions } =
        setupBoardGroupHeaderDOM(username);

      const originalIrrelevantTooltipText = "Collapse group someOtherText";
      tooltipCollapse.textContent = originalIrrelevantTooltipText; // This tooltip doesn't match 'boardUser1'

      processBoardGroupHeader(container);
      if (lastRegisteredCallback) {
        const userData = { name: mockDisplayNamesForFetch[username], timestamp: Date.now(), noExpire: false };
        lastRegisteredCallback(userData);
      }
      await flushPromises();

      expect(avatarImg.alt).toBe(`@${mockDisplayNamesForFetch[username]}`);
      expect(usernameSpan.textContent).toBe(mockDisplayNamesForFetch[username]);
      // This tooltip should NOT change because its original text didn't contain the username 'boardUser1' (case insensitive)
      expect(tooltipCollapse.textContent).toBe(originalIrrelevantTooltipText); 
      // This tooltip SHOULD change
      expect(tooltipActions.textContent).toBe(`Actions for group: ${mockDisplayNamesForFetch[username]}`);
    });
  });
});
