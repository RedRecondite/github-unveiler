// content.projects.test.js

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("GitHub Projects Elements", () => {
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
    projectUser1: "Project User One",
    projectUser2: "Project User Two",
    projectUser3: "Project User Three",
    Done: "User IsDone", // For status keyword tests, if applicable here
    Ready: "User IsReady",
    Blocked: "User IsBlocked",
    "In Progress": "User IsInProgress",
    "No Status": "User HasNoStatus",
  };

  // Helper function to create the primary DOM structure
  function setupPrimaryDOM(username, headingTag = "h3", initialAvatarAlt = null) {
    // If initialAvatarAlt is null, use the username, otherwise use the provided alt.
    // This helps simulate cases where alt might be different or empty.
    const avatarAlt = initialAvatarAlt !== null ? initialAvatarAlt : username;
    document.body.innerHTML = `
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
    return {
      avatar: document.querySelector('img[data-testid="github-avatar"]'),
      heading: document.querySelector(headingTag),
      rootElement: document.body.firstChild // The .item-container-generic or whatever root is processed
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
      const escapedUsername = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?<!\\w)@?${escapedUsername}(?!\\w)`, "g");
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
      const userData = displayNames[username] || { name: username, timestamp: 0, noExpire: true };
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

    fetchDisplayName = jest.fn(async (username) => {
        if (username === "No Assignees" || username === "") { // Explicitly skip for these
            return;
        }
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

    processProjectElements = (root) => {
        if (!(root instanceof Element)) return;
        const avatarSelector = 'img[data-testid="github-avatar"]';
        let avatarsToProcess = [];
        if (root.matches(avatarSelector)) avatarsToProcess.push(root);
        avatarsToProcess.push(...Array.from(root.querySelectorAll(avatarSelector)));
        avatarsToProcess = Array.from(new Set(avatarsToProcess));

        avatarsToProcess.forEach(avatarElement => {
            let hElement = null; // Can be h1, h2, h3, h4, h5, h6
            const iconWrapper = avatarElement.parentElement;
            const leadingVisualWrapper = iconWrapper ? iconWrapper.parentElement : null;
            const mainContentWrapper = leadingVisualWrapper && leadingVisualWrapper.nextElementSibling ? leadingVisualWrapper.nextElementSibling : null;

            if (mainContentWrapper) {
                hElement = mainContentWrapper.querySelector("h1, h2, h3, h4, h5, h6");
            }
            if (!hElement) {
                const listItemAncestor = avatarElement.closest("li");
                if (listItemAncestor) hElement = listItemAncestor.querySelector("h1, h2, h3, h4, h5, h6");
            }
            if (!hElement) {
                let current = avatarElement; let parentCount = 0;
                for (let i = 0; i < 3 && current.parentElement; i++) {
                    current = current.parentElement; parentCount++;
                }
                if (parentCount > 0 && current && current !== document.body && current !== document.documentElement) {
                    hElement = current.querySelector("h1, h2, h3, h4, h5, h6");
                }
            }

            if (!hElement) return;
            if (hElement.hasAttribute(PROCESSED_MARKER)) return;
            
            // Username is from the heading text content
            const username = hElement.textContent.trim();
            if (!username || username === "No Assignees" || username === "") return;

            const processUpdateCallback = (userData) => {
                const hUpdated = updateTextNodes(hElement, username, userData.name);
                if (hUpdated) hElement.setAttribute(PROCESSED_MARKER, "true");
                // Avatar alt text should typically be @username or @displayname
                if (avatarElement.alt !== `@${userData.name}`) {
                    avatarElement.alt = `@${userData.name}`;
                }
            };

            if (displayNames[username] && displayNames[username].name !== undefined) {
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

  test("should update username in H3 and avatar alt (primary traversal)", async () => {
    const username = "projectUser1";
    const { avatar, heading } = setupPrimaryDOM(username, "h3", `@${username}`); // Initial alt @username
    
    processProjectElements(document.body);
    if (lastRegisteredCallback) {
      lastRegisteredCallback({ name: mockDisplayNamesForFetch[username], timestamp: Date.now(), noExpire: false });
    }
    await flushPromises();

    expect(heading.textContent).toBe(mockDisplayNamesForFetch[username]);
    expect(avatar.getAttribute("alt")).toBe(`@${mockDisplayNamesForFetch[username]}`);
    expect(heading.getAttribute(PROCESSED_MARKER)).toBe("true");
  });

  test("should update username in H4 and avatar alt (primary traversal, different heading)", async () => {
    const username = "projectUser2";
    const { avatar, heading } = setupPrimaryDOM(username, "h4", `@${username}`);
    
    processProjectElements(document.body);
    if (lastRegisteredCallback) {
      lastRegisteredCallback({ name: mockDisplayNamesForFetch[username], timestamp: Date.now(), noExpire: false });
    }
    await flushPromises();

    expect(heading.textContent).toBe(mockDisplayNamesForFetch[username]);
    expect(avatar.getAttribute("alt")).toBe(`@${mockDisplayNamesForFetch[username]}`);
    expect(heading.getAttribute(PROCESSED_MARKER)).toBe("true");
  });

  test("should update username using closest('li') fallback", async () => {
    const username = "projectUser1";
    document.body.innerHTML = `
      <ul>
        <li class="list-item-generic">
          <div>
            <img data-testid="github-avatar" alt="@${username}" src="#" />
            <h2>${username}</h2>
          </div>
          <span>Some other text</span>
        </li>
      </ul>
    `;
    const avatar = document.querySelector('img[data-testid="github-avatar"]');
    const heading = document.querySelector("h2");

    processProjectElements(document.body);
    if (lastRegisteredCallback) {
      lastRegisteredCallback({ name: mockDisplayNamesForFetch[username], timestamp: Date.now(), noExpire: false });
    }
    await flushPromises();

    expect(heading.textContent).toBe(mockDisplayNamesForFetch[username]);
    expect(avatar.getAttribute("alt")).toBe(`@${mockDisplayNamesForFetch[username]}`);
    expect(heading.getAttribute(PROCESSED_MARKER)).toBe("true");
  });

  test("should update username using 'up 3 parents' fallback", async () => {
    const username = "projectUser2";
    document.body.innerHTML = `
      <div class="grandparent"> <!-- Avatar is 3 levels down from here -->
        <div class="parent-of-uncle"> 
            <div class="uncle-contains-heading"> <!-- Heading is here -->
               <h5>${username}</h5>
            </div>
        </div>
        <div class="parent-of-avatar"> <!-- Avatar is here -->
          <span class="sibling-of-icon-wrapper">
              <img data-testid="github-avatar" alt="@${username}" src="#" />
          </span>
        </div>
      </div>
    `;
    // This DOM structure is a bit contrived to specifically test the 3-parents search for H5
    // The key is that avatar is somewhat distant from its heading.
    // processProjectElements starts from avatar, goes up, then querySelector for heading.
    // Let's adjust the mocked processProjectElements if its traversal is too specific.
    // The current mock goes up 3 from avatar and then queries.
    // So, if avatar is in parent-of-avatar/sibling-of-icon-wrapper, up 3 is 'grandparent'.
    // Then it queries for H5 within 'grandparent'. This structure should work.

    const avatar = document.querySelector('img[data-testid="github-avatar"]');
    const heading = document.querySelector("h5");
    
    processProjectElements(document.body); // process the whole body or specific container
    if (lastRegisteredCallback) {
      lastRegisteredCallback({ name: mockDisplayNamesForFetch[username], timestamp: Date.now(), noExpire: false });
    }
    await flushPromises();

    expect(heading.textContent).toBe(mockDisplayNamesForFetch[username]);
    expect(avatar.getAttribute("alt")).toBe(`@${mockDisplayNamesForFetch[username]}`);
    expect(heading.getAttribute(PROCESSED_MARKER)).toBe("true");
  });


  test("should update dynamically added project items (MutationObserver, primary traversal)", async () => {
    const username = "projectUser1";
    // Create initial empty container, then add content, then process
    const dynamicContentContainer = document.createElement("div");
    document.body.appendChild(dynamicContentContainer);
    
    // Setup and append new DOM content
    const projectItemRoot = document.createElement("div"); // This div will be the root for processing
    projectItemRoot.className = "item-container-generic"; // Match class used in setupPrimaryDOM
    projectItemRoot.innerHTML = `
      <div class="leading-visual-wrapper-generic">
        <div class="icon-wrapper-generic">
          <img data-testid="github-avatar" alt="@${username}" src="#" />
        </div>
      </div>
      <div class="main-content-wrapper-generic">
        <h3>${username}</h3>
      </div>
    `;
    dynamicContentContainer.appendChild(projectItemRoot);

    const avatar = projectItemRoot.querySelector('img[data-testid="github-avatar"]');
    const h3 = projectItemRoot.querySelector("h3");

    processProjectElements(dynamicContentContainer); // Process the container where new element was added

    if (lastRegisteredCallback) {
      lastRegisteredCallback({ name: mockDisplayNamesForFetch[username], timestamp: Date.now(), noExpire: false });
    }
    await flushPromises();
    // await new Promise((r) => setTimeout(r, 0)); // Additional small delay if needed

    expect(h3.textContent).toBe(mockDisplayNamesForFetch[username]);
    expect(avatar.getAttribute("alt")).toBe(`@${mockDisplayNamesForFetch[username]}`);
    expect(h3.getAttribute(PROCESSED_MARKER)).toBe("true");
  });

  test("should not process 'No Assignees' in H3 (primary traversal) and not call fetch", async () => {
    const username = "No Assignees";
    const { avatar, heading } = setupPrimaryDOM(username, "h3", ""); // Empty initial alt

    processProjectElements(document.body);
    await flushPromises();

    expect(heading.textContent).toBe("No Assignees");
    expect(heading.hasAttribute(PROCESSED_MARKER)).toBe(false); // Should not be processed
    expect(fetchDisplayName).not.toHaveBeenCalledWith("No Assignees");
  });
});
