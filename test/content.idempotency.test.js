// content.idempotency.test.js

// A helper to flush pending microtasks.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Idempotency and Marker Tests", () => {
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

  // Helper function to create the primary DOM structure
  function setupPrimaryDOM(username, headingTag = "h3") {
    document.body.innerHTML = `
      <div class="item-container-generic">
        <div class="leading-visual-wrapper-generic">
          <div class="icon-wrapper-generic">
            <img data-testid="github-avatar" alt="${username}" src="#" />
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

  test("running the script twice on the same anchor duplicates inner username", async () => {
    const tbbleFetchMock = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () =>
          Promise.resolve(
            '<html><body><div class="vcard-fullname">Paul "TBBle" Hampson</div></body></html>'
          ),
      })
    );
    global.fetch = tbbleFetchMock;

    const anchor = document.createElement("a");
    anchor.setAttribute("data-hovercard-url", "/users/TBBle");
    anchor.textContent = "Hello @TBBle!";
    document.body.appendChild(anchor);

    require("../content.js");
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));
    expect(anchor.textContent).toBe('Hello @Paul "TBBle" Hampson!');
    expect(anchor.getAttribute("data-ghu-processed")).toBe("true");

    jest.resetModules();

    global.fetch = tbbleFetchMock;
    const newSendMessageMock = jest.fn((msg) => {
      if (msg.type === "acquireLock")
        return Promise.resolve({ acquired: true });
      if (msg.type === "releaseLock") return Promise.resolve({ success: true });
      return Promise.resolve({});
    });

    global.chrome = {
      storage: {
        local: {
          get: jest.fn((keys, callback) => {
            callback({
              githubDisplayNameCache: {},
            });
          }),
          set: jest.fn((obj, callback) => {
            callback();
          }),
        },
      },
      runtime: {
        sendMessage: newSendMessageMock,
      },
    };

    require("../content.js");
    await flushPromises();
    await new Promise((r) => setTimeout(r, 0));

    expect(anchor.textContent).toBe('Hello @Paul "TBBle" Hampson!');
  });

  test("data-ghu-processed attribute should prevent re-processing (primary traversal)", async () => {
    const { heading } = setupPrimaryDOM("projectUser1", "h3");
    heading.setAttribute("data-ghu-processed", "true");

    const fetchSpy = global.fetch;
    const sendMessageSpy = global.chrome.runtime.sendMessage;

    require("../content.js");
    await flushPromises();

    expect(heading.textContent).toBe("projectUser1");

    let calledForProjectUser1 = false;
    for (const call of fetchSpy.mock.calls) {
      if (call[0].includes("/projectUser1")) {
        calledForProjectUser1 = true;
        break;
      }
    }
    expect(calledForProjectUser1).toBe(false);

    let sendMessageForProjectUser1 = false;
    for (const call of sendMessageSpy.mock.calls) {
      if (
        call[0].type === "acquireLock" &&
        call[0].username === "projectUser1"
      ) {
        sendMessageForProjectUser1 = true;
        break;
      }
    }
    expect(sendMessageForProjectUser1).toBe(false);
  });
});
