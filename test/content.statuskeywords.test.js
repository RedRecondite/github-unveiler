// content.statuskeywords.test.js

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("GitHub Projects Status Keyword Handling", () => {
  // --- Start of common setup for content.js testing ---
  let displayNames = {};
  let elementsByUsername = {};
  let lastRegisteredCallback = null;
  let fetchDisplayName;
  let registerElement;
  let updateElements;
  let updateTextNodes;
  let processProjectElements; // Specific function for this test suite

  const PROCESSED_MARKER = "data-ghu-processed";
  const CACHE_KEY = "githubDisplayNameCache";

  const mockDisplayNamesForFetch = {
    Done: "User IsDone",
    Ready: "User IsReady",
    Blocked: "User IsBlocked",
    "In Progress": "User IsInProgress", // Note: content.js might normalize this to "InProgress" for key
    "No Status": "User HasNoStatus",   // Note: content.js might normalize this to "NoStatus" for key
  };
  
  // Helper function to create a DOM structure for status keyword tests with an avatar
  function setupStatusDOMWithAvatar(keyword, headingTag = "h3", initialAvatarAlt = null) {
    const avatarAlt = initialAvatarAlt !== null ? initialAvatarAlt : keyword;
    const rootElement = document.createElement('div'); // Process this root
    rootElement.innerHTML = `
      <div class="item-container-generic">
        <div class="leading-visual-wrapper-generic">
          <div class="icon-wrapper-generic">
            <img data-testid="github-avatar" alt="${avatarAlt}" src="#" />
          </div>
        </div>
        <div class="main-content-wrapper-generic">
          <${headingTag}>${keyword}</${headingTag}>
        </div>
      </div>
    `;
    document.body.appendChild(rootElement);
    return {
      avatar: rootElement.querySelector('img[data-testid="github-avatar"]'),
      heading: rootElement.querySelector(headingTag),
      rootElement: rootElement, // Pass this to processProjectElements
    };
  }
  
  // Helper for DOM structure without an avatar, where keywords should NOT be processed as usernames
  function setupStatusDOMNoAvatar(keyword, headingTag = "h3") {
    const rootElement = document.createElement('div');
    rootElement.innerHTML = `
      <div class="item-container-generic-status-no-avatar">
        <div class="leading-visual-wrapper-generic-status">
          <div class="icon-wrapper-generic-status-icon">
            <div class="some-status-icon-class"></div>
          </div>
        </div>
        <div class="main-content-wrapper-generic-status">
          <${headingTag}>${keyword}</${headingTag}>
        </div>
      </div>
    `;
    document.body.appendChild(rootElement);
    return {
        heading: rootElement.querySelector(headingTag),
        rootElement: rootElement,
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
    global.fetch = jest.fn();
    global.location = { hostname: "github.com" };

    updateTextNodes = (element, username, nameToDisplay) => {
      const baseUsername = username.replace(/^@/, "");
      const escapedBaseUsername = baseUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?<!\\w)@?${escapedBaseUsername}(?!\\w)`, "g");
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node;
      let changed = false;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes(nameToDisplay) && !node.textContent.match(regex)) continue;
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
      // Normalize username for cache access (e.g. "In Progress" -> "InProgress")
      // This should match how it's stored as a key in displayNames / mockDisplayNamesForFetch
      const normalizedUsernameKey = username.replace(/\s+/g, ""); 
      const userData = displayNames[normalizedUsernameKey] || 
                       displayNames[username] || // Fallback to original if not normalized
                       { name: username, timestamp: 0, noExpire: true };

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
        const username = rawUsername.replace(/^@/, "");
        // Keywords like "Done", "In Progress" should not be skipped here if they are to be fetched
        if (username === "No Assignees") return; 
        
        // For keywords like "In Progress", the key in mockDisplayNamesForFetch might be "InProgress"
        const normalizedUsernameKey = username.replace(/\s+/g, "");

        if (displayNames[normalizedUsernameKey] && displayNames[normalizedUsernameKey].name !== undefined) {
             updateElements(username); return; 
        }
         if (displayNames[username] && displayNames[username].name !== undefined) { // Fallback for non-normalized
             updateElements(username); return;
        }

        try {
            const fetchedName = mockDisplayNamesForFetch[normalizedUsernameKey] || 
                                mockDisplayNamesForFetch[username] || 
                                username;
            let effectiveName = (fetchedName === null || fetchedName.trim() === '') ? username : fetchedName;
            
            // Store with the key that will be used for lookup in updateElements
            displayNames[normalizedUsernameKey] = { name: effectiveName, timestamp: Date.now(), noExpire: false };
            if (normalizedUsernameKey !== username) { // ensure original form can also be looked up if necessary by some older code
                 displayNames[username] = { name: effectiveName, timestamp: Date.now(), noExpire: false };
            }

            await global.chrome.runtime.sendMessage({
                type: "releaseLock", origin: global.location.hostname,
                username: username, displayName: effectiveName
            });
            updateElements(username); // Call with original username passed to fetchDisplayName
        } catch (err) {
            console.error(`Error fetching display name for @${username} (test mock):`, err);
            displayNames[normalizedUsernameKey] = { name: username, timestamp: Date.now(), noExpire: true };
             if (normalizedUsernameKey !== username) {
                 displayNames[username] = { name: username, timestamp: Date.now(), noExpire: true };
            }
            updateElements(username);
        }
    });
    
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
            // Simplified: Not including the 3-parent fallback for this test suite unless proven necessary
            
            if (!hElement) { /* console.log("No heading found for avatar:", avatarElement); */ return; }
            if (hElement.hasAttribute(PROCESSED_MARKER)) { /* console.log("Heading already processed:", hElement); */ return; }
            
            const usernameFromHeading = hElement.textContent.trim();
            // Crucial: "No Assignees" is skipped. Status keywords should NOT be skipped here by default.
            if (!usernameFromHeading || usernameFromHeading === "No Assignees") {
                return;
            }
            // The fetchDisplayName mock will handle if "No Assignees" is passed to it.

            const processUpdateCallback = (userData) => {
                const hUpdated = updateTextNodes(hElement, usernameFromHeading, userData.name);
                // Only mark processed if text actually changed.
                if (hUpdated) hElement.setAttribute(PROCESSED_MARKER, "true");
                
                // Avatar alt usually takes @ prefix
                if (avatarElement.alt !== `@${userData.name}`) {
                    avatarElement.alt = `@${userData.name}`;
                }
            };
            
            // Normalize for cache lookup, consistent with fetchDisplayName mock
            const normalizedUsernameKey = usernameFromHeading.replace(/\s+/g, "");
            if ((displayNames[normalizedUsernameKey] && displayNames[normalizedUsernameKey].name !== undefined) ||
                (displayNames[usernameFromHeading] && displayNames[usernameFromHeading].name !== undefined) ) {
                processUpdateCallback(displayNames[normalizedUsernameKey] || displayNames[usernameFromHeading]);
            } else {
                registerElement(usernameFromHeading, processUpdateCallback);
                fetchDisplayName(usernameFromHeading);
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

  const KNOWN_STATUS_KEYWORDS = [
    "Done", "Ready", "Blocked", "In Progress", "No Status",
  ];

  KNOWN_STATUS_KEYWORDS.forEach((keyword) => {
    test(`should NOT process H3 with status keyword "${keyword}" (no avatar structure)`, async () => {
      const { heading, rootElement } = setupStatusDOMNoAvatar(keyword, "h3");
      
      processProjectElements(rootElement); // processProjectElements looks for avatars
      await flushPromises();

      expect(heading.textContent).toBe(keyword); // Should remain unchanged
      expect(heading.hasAttribute(PROCESSED_MARKER)).toBe(false);
      // fetchDisplayName should not be called because no avatar means processProjectElements bails early for this item
      expect(fetchDisplayName).not.toHaveBeenCalledWith(keyword);
    });

    test(`should process H3 with keyword "${keyword}" as username IF avatar is present (primary traversal)`, async () => {
      // Initial alt might be the keyword itself or @keyword
      const { avatar, heading, rootElement } = setupStatusDOMWithAvatar(keyword, "h3", `@${keyword}`);
      const normalizedKeywordKey = keyword.replace(/\s+/g,"");
      const expectedDisplayName = mockDisplayNamesForFetch[normalizedKeywordKey] || mockDisplayNamesForFetch[keyword];

      processProjectElements(rootElement);
      if (lastRegisteredCallback) {
        lastRegisteredCallback({ name: expectedDisplayName, timestamp: Date.now(), noExpire: false });
      }
      await flushPromises();

      expect(heading.textContent).toBe(expectedDisplayName);
      expect(avatar.getAttribute("alt")).toBe(`@${expectedDisplayName}`);
      expect(heading.hasAttribute(PROCESSED_MARKER)).toBe(true);
      expect(fetchDisplayName).toHaveBeenCalledWith(keyword);
    });
  });
});
