// content.boardgroupheader.test.js

// A helper to flush pending microtasks.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Board Group Header Processing", () => {
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

  // Helper function to set up DOM for board group header tests
  function setupBoardGroupHeaderDOM(username) {
    const container = document.createElement("div");
    container.className = "board-group-header-container";

    const innerMimicDiv = document.createElement("div");
    container.appendChild(innerMimicDiv);

    const collapseButton = document.createElement("button");
    collapseButton.textContent = "...";
    innerMimicDiv.appendChild(collapseButton);

    const tooltipCollapse = document.createElement("span");
    tooltipCollapse.setAttribute("popover", "auto");
    tooltipCollapse.id = "tooltip-collapse";
    tooltipCollapse.textContent = `Collapse group ${username}`;
    innerMimicDiv.appendChild(tooltipCollapse);

    const headerContentBlock = document.createElement("div");
    headerContentBlock.className = "header-content-block";
    innerMimicDiv.appendChild(headerContentBlock);

    const avatarCountSpan = document.createElement("span");
    avatarCountSpan.setAttribute("data-avatar-count", "1");
    headerContentBlock.appendChild(avatarCountSpan);

    const avatarStackBody = document.createElement("div");
    avatarCountSpan.appendChild(avatarStackBody);

    const avatarImg = document.createElement("img");
    avatarImg.setAttribute("data-testid", "github-avatar");
    avatarImg.setAttribute("alt", username);
    avatarImg.setAttribute("src", "#");
    avatarStackBody.appendChild(avatarImg);

    const usernameSpan = document.createElement("span");
    usernameSpan.textContent = username;
    headerContentBlock.appendChild(usernameSpan);

    const countSpan = document.createElement("span");
    countSpan.textContent = "3";
    headerContentBlock.appendChild(countSpan);

    const actionsButton = document.createElement("button");
    actionsButton.textContent = "...";
    innerMimicDiv.appendChild(actionsButton);

    const tooltipActions = document.createElement("span");
    tooltipActions.setAttribute("popover", "auto");
    tooltipActions.id = "tooltip-actions";
    tooltipActions.textContent = `Actions for group: ${username}`;
    innerMimicDiv.appendChild(tooltipActions);

    document.body.appendChild(container);

    return {
      container,
      avatarImg,
      usernameSpan,
      tooltipCollapse,
      tooltipActions,
      headerContentBlock,
    };
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

  describe("processBoardGroupHeader", () => {
    test("Basic Replacement: should update avatar, username span, and tooltips", async () => {
      const {
        avatarImg,
        usernameSpan,
        tooltipCollapse,
        tooltipActions,
        headerContentBlock,
      } = setupBoardGroupHeaderDOM("boardUser1");
      const processedContainer = headerContentBlock.parentElement;

      require("../content.js");
      await flushPromises();
      await new Promise((r) => setTimeout(r, 0));

      expect(avatarImg.alt).toBe("@Board User One");
      expect(usernameSpan.textContent).toBe("Board User One");
      expect(tooltipCollapse.textContent).toBe("Collapse group Board User One");
      expect(tooltipActions.textContent).toBe(
        "Actions for group: Board User One"
      );
      expect(processedContainer.hasAttribute("data-ghu-processed")).toBe(true);
    });

    test("Already Processed: should not re-process if container is marked", async () => {
      const {
        avatarImg,
        usernameSpan,
        tooltipCollapse,
        tooltipActions,
        headerContentBlock,
      } = setupBoardGroupHeaderDOM("boardUser1");
      const processedContainer = headerContentBlock.parentElement;
      processedContainer.setAttribute("data-ghu-processed", "true");

      const originalAlt = avatarImg.alt;
      const originalUsernameText = usernameSpan.textContent;
      const originalCollapseTooltip = tooltipCollapse.textContent;
      const originalActionsTooltip = tooltipActions.textContent;

      const fetchSpy = jest.spyOn(global, "fetch");
      require("../content.js");
      await flushPromises();

      expect(avatarImg.alt).toBe(originalAlt);
      expect(usernameSpan.textContent).toBe(originalUsernameText);
      expect(tooltipCollapse.textContent).toBe(originalCollapseTooltip);
      expect(tooltipActions.textContent).toBe(originalActionsTooltip);

      let calledForBoardUser1 = false;
      for (const call of fetchSpy.mock.calls) {
        if (call[0].includes("/boardUser1")) {
          calledForBoardUser1 = true;
          break;
        }
      }
      expect(calledForBoardUser1).toBe(false);
      fetchSpy.mockRestore();
    });

    test("Dynamic Addition: should process dynamically added board group headers", async () => {
      require("../content.js");

      const {
        avatarImg,
        usernameSpan,
        tooltipCollapse,
        tooltipActions,
        headerContentBlock,
      } = setupBoardGroupHeaderDOM("boardUser1");
      const processedContainer = headerContentBlock.parentElement;

      await flushPromises();
      await new Promise((r) => setTimeout(r, 50));

      expect(avatarImg.alt).toBe("@Board User One");
      expect(usernameSpan.textContent).toBe("Board User One");
      expect(tooltipCollapse.textContent).toBe("Collapse group Board User One");
      expect(tooltipActions.textContent).toBe(
        "Actions for group: Board User One"
      );
      expect(processedContainer.hasAttribute("data-ghu-processed")).toBe(true);
    });

    test("Tooltip Not Updated if Username Absent: only relevant tooltips change", async () => {
      const { avatarImg, usernameSpan, tooltipCollapse, tooltipActions } =
        setupBoardGroupHeaderDOM("boardUser1");

      const originalCollapseText = "Collapse group someOtherText";
      tooltipCollapse.textContent = originalCollapseText;

      require("../content.js");
      await flushPromises();
      await new Promise((r) => setTimeout(r, 0));

      expect(avatarImg.alt).toBe("@Board User One");
      expect(usernameSpan.textContent).toBe("Board User One");
      expect(tooltipCollapse.textContent).toBe(originalCollapseText);
      expect(tooltipActions.textContent).toBe(
        "Actions for group: Board User One"
      );
    });
  });
});
