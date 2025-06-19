// content.mutation.test.js

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Mutation Observer", () => {
  // --- Start of common setup for content.js testing ---
  let displayNames = {};
  let elementsByUsername = {};
  let lastRegisteredCallback = null; // Can be an object {username: callback} if needed for multiple pending calls
  
  let fetchDisplayName;
  let registerElement;
  let updateElements;
  let updateTextNodes;

  // All processing functions that the observer might call
  let processAnchorsByHovercard;
  let getUsername; 
  let processProjectElements;
  let processSingleUserGridCell;
  let processMultiUserGridCell;
  let processBoardGroupHeader;
  let processHovercard; // Added from hovercard tests

  const PROCESSED_MARKER = "data-ghu-processed";
  const HOVERCARD_PROCESSED_MARKER = "data-ghu-hovercard-processed"; // For processHovercard
  const CACHE_KEY = "githubDisplayNameCache";
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;


  const mockDisplayNamesForFetch = {
    testuser: "Test User",
    testuser2: "Test User 2", // Used in the test
    // Add other users if other processing functions are robustly tested here
  };
  
  let observer; // To hold the MutationObserver instance

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

    // --- Basic function definitions (copied and adapted from other test files) ---
    updateTextNodes = (element, username, nameToDisplay) => {
      const baseUsername = username.replace(/^@/, "");
      const escapedBaseUsername = baseUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(?<!\\w)@?${escapedBaseUsername}(?!\\w)`, "g");
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let node; let changed = false;
      while ((node = walker.nextNode())) {
        if (node.textContent.includes(nameToDisplay) && !node.textContent.match(regex)) continue;
        const updated = node.textContent.replace(regex, match => match.startsWith("@") ? `@${nameToDisplay}` : nameToDisplay);
        if (updated !== node.textContent) { node.textContent = updated; changed = true; }
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
      cbsToRun.forEach(cb => { try { cb(userData); } catch (e) { console.error("Error for @" + username, e); }});
    };

    registerElement = (username, cb) => {
      const baseUsername = username.replace(/^@/, "");
      if (!elementsByUsername[baseUsername]) elementsByUsername[baseUsername] = [];
      elementsByUsername[baseUsername].push(cb);
      // For simplicity in mutation tests, store one last callback. Complex scenarios might need {username: cb}.
      lastRegisteredCallback = cb; 
    };

    fetchDisplayName = jest.fn(async (rawUsername) => {
        const username = rawUsername.replace(/^@/, "");
        if (username === "No Assignees" || username === "") return;
        if (displayNames[username] && displayNames[username].name !== undefined) {
             updateElements(username); return;
        }
        try {
            const response = await global.fetch(`https://${global.location.hostname}/${username}`);
            if (!response.ok) throw new Error("HTTP error " + response.status);
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const el = doc.querySelector(".vcard-fullname");
            let fetchedName = el ? el.textContent.trim() : username;
            if (!fetchedName || fetchedName.trim() === '') fetchedName = username;
            
            displayNames[username] = { name: fetchedName, timestamp: Date.now(), noExpire: false };
            await global.chrome.runtime.sendMessage(/* ... releaseLock message ... */);
            updateElements(username);
        } catch (err) {
            displayNames[username] = { name: username, timestamp: Date.now(), noExpire: true };
            updateElements(username);
        }
    });

    // --- Define ALL processX functions that the observer will call ---
    // These are simplified versions focusing on the parts relevant to mutation testing.
    // They primarily need to correctly identify elements and call register/fetch.

    getUsername = (anchor) => { /* Basic version from anchor.test.js */ 
        const hover = anchor.getAttribute("data-hovercard-url");
        if (hover) { const match = hover.match(/^\/users\/((?!.*%5Bbot%5D)[^\/?]+)/); if (match) return match[1];}
        const href = anchor.getAttribute("href");
        if (href) { let match = href.match(/^\/(orgs\/[^\/]+\/people\/)?((?!.*%5Bbot%5D)[^\/?]+)/); if (match && match[2]) return match[2];}
        return null;
    };
    processAnchorsByHovercard = (root) => { /* Basic version from anchor.test.js */
        const selector = 'a[data-hovercard-url^="/users/"], a[data-octo-click="hovercard-link-click"]';
        (Array.from(root.matches(selector) ? [root] : []).concat(...Array.from(root.querySelectorAll(selector)))).forEach(anchor => {
            if (anchor.hasAttribute(PROCESSED_MARKER)) return;
            const username = getUsername(anchor); if (!username) return;
            const baseUsername = username.replace(/^@/, "");
            const cb = (userData) => { if(updateTextNodes(anchor, baseUsername, userData.name)) anchor.setAttribute(PROCESSED_MARKER, "true");};
            if (displayNames[baseUsername]) cb(displayNames[baseUsername]); else { registerElement(baseUsername, cb); fetchDisplayName(baseUsername); }
        });
    };
    processProjectElements = (root) => { /* Simplified: look for H3 and sibling img */ 
        root.querySelectorAll('h3').forEach(h3 => {
            if(h3.hasAttribute(PROCESSED_MARKER) || !h3.parentElement || !h3.parentElement.previousElementSibling) return;
            const avatar = h3.parentElement.previousElementSibling.querySelector('img[data-testid="github-avatar"]');
            if(!avatar) return;
            const username = h3.textContent.trim(); if(!username || username === "No Assignees") return;
            const cb = ud => { updateTextNodes(h3,username,ud.name); avatar.alt = `@${ud.name}`; h3.setAttribute(PROCESSED_MARKER, "true");};
            if(displayNames[username]) cb(displayNames[username]); else { registerElement(username,cb); fetchDisplayName(username);}
        });
    };
    processSingleUserGridCell = (root) => { /* Simplified */ 
        root.querySelectorAll('div[role="gridcell"]').forEach(cell => {
            if(cell.hasAttribute(PROCESSED_MARKER)) return;
            const avatar = cell.querySelector('img[data-testid="github-avatar"]');
            const span = cell.querySelector('span'); // Highly simplified
            if(!avatar || !span) return;
            const username = (avatar.alt || span.textContent || "").replace(/^@/,"").trim(); if(!username) return;
            const cb = ud => { updateTextNodes(span,username,ud.name); avatar.alt = `@${ud.name}`; cell.setAttribute(PROCESSED_MARKER,"true");};
            if(displayNames[username]) cb(displayNames[username]); else {registerElement(username,cb); fetchDisplayName(username); }
        });
    };
    processMultiUserGridCell = (root) => { /* Placeholder - needs full def if tested */ };
    processBoardGroupHeader = (root) => { /* Placeholder - needs full def if tested */ };
    processHovercard = (root) => { /* Placeholder - needs full def if tested */ };

    // --- Setup MutationObserver ---
    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Call all relevant test-scoped processing functions
            processAnchorsByHovercard(node);
            processProjectElements(node);
            processSingleUserGridCell(node);
            // processMultiUserGridCell(node); // Add if testing this path
            // processBoardGroupHeader(node); // Add if testing this path
            // processHovercard(node); // Add if testing this path
          }
        });
      }
    });
    // Start observing document.body for the tests (or a specific container if preferred)
    observer.observe(document.body, { childList: true, subtree: true });
  });

  beforeEach(() => {
    displayNames = {};
    elementsByUsername = {};
    lastRegisteredCallback = null;
    global.chrome.runtime.sendMessage.mockClear();
    global.fetch.mockClear();
    if (fetchDisplayName.mockClear) fetchDisplayName.mockClear();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    document.body.innerHTML = ""; // Clear body for each test
     // Ensure the observer is observing a fresh body if tests manipulate document.body directly
    if(observer) observer.disconnect(); // Disconnect previous if any
    observer.observe(document.body, { childList: true, subtree: true }); // Re-observe the new body
  });

  afterEach(() => {
    if (observer) observer.disconnect(); // Stop observing after each test
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  test("should update new anchors added via MutationObserver", async () => {
    // Mock global.fetch for this specific username
    global.fetch.mockImplementation(async (url) => {
      if (url.includes("/testuser2")) {
        return ({ ok: true, text: async () => `<html><body><div class="vcard-fullname">${mockDisplayNamesForFetch.testuser2}</div></body></html>` });
      }
      return ({ ok: false, status: 404, text: async () => "Not Found" });
    });

    const container = document.createElement("div");
    document.body.appendChild(container); // Observer is on document.body

    const anchor = document.createElement("a");
    anchor.setAttribute("data-hovercard-url", "/users/testuser2");
    anchor.textContent = "testuser2"; // Initial text
    container.appendChild(anchor); // This triggers the mutation

    await flushPromises(); // Allow MutationObserver to fire
    // A short timeout might be needed if processing involves its own async steps not covered by flushPromises
    await new Promise(r => setTimeout(r, 50)); 

    // Callback simulation if registerElement was used by processAnchorsByHovercard
    // This depends on how robust the test-scoped processAnchorsByHovercard is.
    // If fetchDisplayName mock directly updates displayNames and calls updateElements, this might not be needed.
    if (lastRegisteredCallback && elementsByUsername["testuser2"]) {
       // This check is problematic if updateElements clears elementsByUsername before this runs
       // Let's rely on fetchDisplayName to call updateElements.
    }
    
    // One more flush to ensure updates from fetchDisplayName/updateElements propagate
    await flushPromises();
    await new Promise(r => setTimeout(r, 0));


    expect(anchor.textContent).toBe(mockDisplayNamesForFetch.testuser2);
    expect(anchor.getAttribute(PROCESSED_MARKER)).toBe("true");
  });
});
