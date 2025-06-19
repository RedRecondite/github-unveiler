// content.grid.multi.test.js

// A helper to flush pending microtasks.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Grid Cell Processing - Multi User", () => {
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
      // This part is not used in this file but kept for consistency
      if (typeof usernames !== "string") {
        throw new Error("For 'single' type, usernames must be a string.");
      }
    } else if (type === "multi") {
      if (!Array.isArray(usernames)) {
        throw new Error("For 'multi' type, usernames must be an array.");
      }

      const multiUserSpan = document.createElement("span");
      multiUserSpan.setAttribute(
        "data-avatar-count",
        usernames.length.toString()
      );
      const avatarStackBody = document.createElement("div");
      multiUserSpan.appendChild(avatarStackBody);

      const avatarImgs = [];
      usernames.forEach((username) => {
        const img = document.createElement("img");
        img.setAttribute("data-testid", "github-avatar");
        img.setAttribute("alt", username);
        img.setAttribute("src", "#");
        avatarStackBody.appendChild(img);
        avatarImgs.push(img);
      });

      let usernamesText = "";
      if (usernames.length === 1) {
        usernamesText = usernames[0];
      } else if (usernames.length === 2) {
        usernamesText = `${usernames[0]} and ${usernames[1]}`;
      } else if (usernames.length > 2) {
        usernamesText =
          usernames.slice(0, -1).join(", ") +
          ", and " +
          usernames[usernames.length - 1];
      }

      const usernamesTextSpan = document.createElement("span");
      usernamesTextSpan.textContent = usernamesText;

      innerDiv.appendChild(multiUserSpan);
      innerDiv.appendChild(usernamesTextSpan);
      document.body.appendChild(cell);
      return { cell, multiUserSpan, avatarImgs, usernamesTextSpan };
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

  describe("processMultiUserGridCell", () => {
    test("Basic Multi-User (3 users): should update alts and text span", async () => {
      const users = ["gridUser1", "gridUser2", "gridUser3"];
      const { cell, avatarImgs, usernamesTextSpan } = setupGridCellDOM(
        users,
        "multi"
      );

      require("../content.js");
      await flushPromises();
      await new Promise((r) => setTimeout(r, 0));

      expect(avatarImgs[0].alt).toBe("@Grid User One");
      expect(avatarImgs[1].alt).toBe("@Grid User Two");
      expect(avatarImgs[2].alt).toBe("@Grid User Three");
      expect(usernamesTextSpan.textContent).toBe(
        "Grid User One, Grid User Two, and Grid User Three"
      );
      expect(cell.hasAttribute("data-ghu-processed")).toBe(true);
    });

    test("Multi-User (2 users): should update alts and text span correctly", async () => {
      const users = ["gridUser1", "gridUser2"];
      const { avatarImgs, usernamesTextSpan } = setupGridCellDOM(
        users,
        "multi"
      );

      require("../content.js");
      await flushPromises();
      await new Promise((r) => setTimeout(r, 0));

      expect(avatarImgs[0].alt).toBe("@Grid User One");
      expect(avatarImgs[1].alt).toBe("@Grid User Two");
      expect(usernamesTextSpan.textContent).toBe(
        "Grid User One and Grid User Two"
      );
    });

    test("Multi-User (1 user in multi-cell structure): should update alt and text span", async () => {
      const users = ["gridUser1"];
      const { avatarImgs, usernamesTextSpan } = setupGridCellDOM(
        users,
        "multi"
      );

      require("../content.js");
      await flushPromises();
      await new Promise((r) => setTimeout(r, 0));

      expect(avatarImgs[0].alt).toBe("@Grid User One");
      expect(usernamesTextSpan.textContent).toBe("Grid User One");
    });

    test("Already Processed (Multi-User): should not re-process", async () => {
      const users = ["gridUser1", "gridUser2"];
      const { cell, avatarImgs, usernamesTextSpan } = setupGridCellDOM(
        users,
        "multi"
      );
      cell.setAttribute("data-ghu-processed", "true");

      const initialAltUser1 = avatarImgs[0].alt;
      const initialAltUser2 = avatarImgs[1].alt;
      const initialText = usernamesTextSpan.textContent;

      const fetchSpy = jest.spyOn(global, "fetch");
      require("../content.js");
      await flushPromises();

      expect(avatarImgs[0].alt).toBe(initialAltUser1);
      expect(avatarImgs[1].alt).toBe(initialAltUser2);
      expect(usernamesTextSpan.textContent).toBe(initialText);

      let calledForAnyUser = false;
      for (const call of fetchSpy.mock.calls) {
        if (users.some((user) => call[0].includes(`/${user}`))) {
          calledForAnyUser = true;
          break;
        }
      }
      expect(calledForAnyUser).toBe(false);
      fetchSpy.mockRestore();
    });

    test("Dynamic Addition (Multi-User): should process dynamically added cells", async () => {
      require("../content.js");

      const users = ["gridUser2", "gridUser3"];
      const { avatarImgs, usernamesTextSpan } = setupGridCellDOM(
        users,
        "multi"
      );

      await flushPromises();
      await new Promise((r) => setTimeout(r, 50));

      expect(avatarImgs[0].alt).toBe("@Grid User Two");
      expect(avatarImgs[1].alt).toBe("@Grid User Three");
      expect(usernamesTextSpan.textContent).toBe(
        "Grid User Two and Grid User Three"
      );
    });
  });
});
