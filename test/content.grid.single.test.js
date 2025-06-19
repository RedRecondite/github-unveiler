// content.grid.single.test.js

// A helper to flush pending microtasks.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Grid Cell Processing - Single User", () => {
  let fakeCache;

  const mockDisplayNames = {
    testuser: "Test User",
    testuser2: "Test User 2",
    octouser: "Test Octo",
    user123: "Test User 123",
    TBBle: 'Paul "TBBle" Hampson',
    projectUser1: "Project User One",
    projectUser2: "Project User Two",
    projectUser3: "Project User Three",
    Done: "User IsDone",
    Ready: "User IsReady",
    Blocked: "User IsBlocked",
    "In Progress": "User IsInProgress",
    "No Status": "User HasNoStatus",
    gridUser1: "Grid User One",
    gridUser2: "Grid User Two",
    gridUser3: "Grid User Three",
    boardUser1: "Board User One",
    emptyUser: "",
    spaceUser: "   ",
  };

  // Helper function to set up DOM for grid cell tests
  function setupGridCellDOM(usernames, type) {
    const cell = document.createElement("div");
    cell.setAttribute("role", "gridcell");
    const innerDiv = document.createElement("div");
    cell.appendChild(innerDiv);

    if (type === "single") {
      if (typeof usernames !== "string") {
        throw new Error("For 'single' type, usernames must be a string.");
      }
      const userDiv = document.createElement("div");
      const img = document.createElement("img");
      img.setAttribute("data-testid", "github-avatar");
      img.setAttribute("alt", usernames);
      img.setAttribute("src", "#");

      const usernameSpan = document.createElement("span");
      usernameSpan.textContent = usernames;

      userDiv.appendChild(img);
      userDiv.appendChild(usernameSpan);
      innerDiv.appendChild(userDiv);
      document.body.appendChild(cell);
      return { cell, img, usernameSpan };
    } else if (type === "multi") {
      // This part is not used in this file but kept for consistency if the helper is copied elsewhere
      if (!Array.isArray(usernames)) {
        throw new Error("For 'multi' type, usernames must be an array.");
      }
      // Simplified for single user context, full multi-user setup is in its own file's helper
    } else {
      throw new Error(
        "Invalid type specified for setupGridCellDOM. Must be 'single' or 'multi'."
      );
    }
  }

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = "";
    fakeCache = {}; // Reset for each test

    global.chrome = {
      storage: {
        local: {
          get: jest.fn((keys, callback) => {
            const result = {
                githubDisplayNameCache: JSON.parse(JSON.stringify(fakeCache || {}))
            };
            callback(result);
          }),
          set: jest.fn((obj, callback) => {
            if (obj.githubDisplayNameCache) {
              fakeCache = JSON.parse(JSON.stringify(obj.githubDisplayNameCache));
            }
            if (callback) callback();
          }),
        },
      },
      runtime: {
        sendMessage: jest.fn((msg) => {
          if (msg.type === "acquireLock") {
            return Promise.resolve({ acquired: true });
          }
          if (msg.type === "releaseLock") {
            global.chrome.runtime.sendMessage.lastReleaseLockMessage = msg;
            return Promise.resolve({ success: true });
          }
          return Promise.resolve({});
        }),
        lastError: null,
      },
    };

    global.fetch = jest.fn((url) => {
      const potentialUsername = url.substring(url.lastIndexOf("/") + 1);
      const username = decodeURIComponent(potentialUsername);

      if (username === 'nullUser') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<html><body><!-- No vcard-fullname --></body></html>')
        });
      }

      const displayName = mockDisplayNames[username];
      if (typeof displayName !== 'undefined') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(`<html><body><div class="vcard-fullname">${displayName}</div></body></html>`)
        });
      }
      return Promise.resolve({
        ok: false, status: 404, text: () => Promise.resolve("Not Found")
      });
    });

    global.location = { hostname: "github.com" };
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch.mockClear();
    if (global.chrome.runtime.sendMessage.mockClear) {
      global.chrome.runtime.sendMessage.mockClear();
    }
    delete global.chrome.runtime.sendMessage.lastReleaseLockMessage;
    jest.restoreAllMocks();
    document.body.innerHTML = "";
  });

  describe("processSingleUserGridCell", () => {
    test("Basic Replacement: should update alt and span for a single user", async () => {
      const { cell, img, usernameSpan } = setupGridCellDOM(
        "gridUser1",
        "single"
      );
      require("../content.js");
      await flushPromises();
      await new Promise((r) => setTimeout(r, 0));

      expect(img.alt).toBe("@Grid User One");
      expect(usernameSpan.textContent).toBe("Grid User One");
      expect(cell.hasAttribute("data-ghu-processed")).toBe(true);
    });

    test("Already Processed: should not re-process if data-ghu-processed is true", async () => {
      const { cell, img, usernameSpan } = setupGridCellDOM(
        "gridUser1",
        "single"
      );
      cell.setAttribute("data-ghu-processed", "true");

      const fetchSpy = jest.spyOn(global, "fetch");

      require("../content.js");
      await flushPromises();

      expect(img.alt).toBe("gridUser1");
      expect(usernameSpan.textContent).toBe("gridUser1");

      let calledForGridUser1 = false;
      for (const call of fetchSpy.mock.calls) {
        if (call[0].includes("/gridUser1")) {
          calledForGridUser1 = true;
          break;
        }
      }
      expect(calledForGridUser1).toBe(false);
      fetchSpy.mockRestore();
    });

    test("Dynamic Addition (MutationObserver): should process dynamically added single user cells", async () => {
      require("../content.js");

      const { img, usernameSpan } = setupGridCellDOM("gridUser2", "single");

      await flushPromises();
      await new Promise((r) => setTimeout(r, 50));

      expect(img.alt).toBe("@Grid User Two");
      expect(usernameSpan.textContent).toBe("Grid User Two");
    });

    test('Username with leading "@": should correctly update alt and span', async () => {
      const { img, usernameSpan } = setupGridCellDOM("@gridUser1", "single");

      require("../content.js");
      await flushPromises();
      await new Promise((r) => setTimeout(r, 0));

      expect(img.alt).toBe("@Grid User One");
      expect(usernameSpan.textContent).toBe("@Grid User One");
    });
  });
});
