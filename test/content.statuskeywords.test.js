// content.statuskeywords.test.js

// A helper to flush pending microtasks.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("GitHub Projects Status Keyword Handling", () => {
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

  // Helper function to create a DOM structure for status keyword tests with an avatar
  function setupStatusDOMWithAvatar(keyword, headingTag = "h3") {
    document.body.innerHTML = `
      <div class="item-container-generic">
        <div class="leading-visual-wrapper-generic">
          <div class="icon-wrapper-generic">
            <img data-testid="github-avatar" alt="${keyword}" src="#" />
          </div>
        </div>
        <div class="main-content-wrapper-generic">
          <${headingTag}>${keyword}</${headingTag}>
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

  const KNOWN_STATUS_KEYWORDS = [
    "Done",
    "Ready",
    "Blocked",
    "In Progress",
    "No Status",
  ];

  KNOWN_STATUS_KEYWORDS.forEach((keyword) => {
    test(`should NOT process H3 with status keyword "${keyword}" (no avatar structure)`, async () => {
      document.body.innerHTML = `
        <div class="item-container-generic-status-no-avatar">
          <div class="leading-visual-wrapper-generic-status">
            <div class="icon-wrapper-generic-status-icon">
              <div class="some-status-icon-class"></div>
            </div>
          </div>
          <div class="main-content-wrapper-generic-status">
            <h3>${keyword}</h3>
          </div>
        </div>
      `;
      const h3Element = document.body.querySelector("h3");
      const fetchSpy = global.fetch;

      require("../content.js");
      await flushPromises();

      expect(h3Element.textContent).toBe(keyword);
      expect(h3Element.hasAttribute("data-ghu-processed")).toBe(false);

      let calledForKeyword = false;
      for (const call of fetchSpy.mock.calls) {
        if (call[0].includes(`/${keyword}`)) {
          calledForKeyword = true;
          break;
        }
      }
      expect(calledForKeyword).toBe(false);
    });

    test(`should process H3 with keyword "${keyword}" as username IF avatar is present (primary traversal)`, async () => {
      const { avatar, heading } = setupStatusDOMWithAvatar(keyword, "h3");
      const fetchSpy = global.fetch;
      const expectedDisplayName = mockDisplayNames[keyword];

      require("../content.js");
      await flushPromises();

      expect(heading.textContent).toBe(expectedDisplayName);
      expect(avatar.getAttribute("alt")).toBe(expectedDisplayName);
      expect(heading.hasAttribute("data-ghu-processed")).toBe(true);

      let calledForKeyword = false;
      for (const call of fetchSpy.mock.calls) {
        if (decodeURIComponent(call[0]).includes(`/${keyword}`)) {
          calledForKeyword = true;
          break;
        }
      }
      expect(calledForKeyword).toBe(true);
    });
  });
});
