// content.projects.test.js

// A helper to flush pending microtasks.
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("GitHub Projects Elements", () => {
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

  test("should update username in H3 and avatar alt (primary traversal)", async () => {
    const { avatar, heading } = setupPrimaryDOM("projectUser1", "h3");

    require("../content.js");
    await flushPromises();

    expect(heading.textContent).toBe("Project User One");
    expect(avatar.getAttribute("alt")).toBe("Project User One");
    expect(heading.getAttribute("data-ghu-processed")).toBe("true");
  });

  test("should update username in H4 and avatar alt (primary traversal, different heading)", async () => {
    const { avatar, heading } = setupPrimaryDOM("projectUser2", "h4");

    require("../content.js");
    await flushPromises();

    expect(heading.textContent).toBe("Project User Two");
    expect(avatar.getAttribute("alt")).toBe("Project User Two");
    expect(heading.getAttribute("data-ghu-processed")).toBe("true");
  });

  test("should update username using closest('li') fallback", async () => {
    document.body.innerHTML = `
      <ul>
        <li class="list-item-generic">
          <div>
            <img data-testid="github-avatar" alt="projectUser1" src="#" />
            <h2>projectUser1</h2>
          </div>
          <span>Some other text</span>
        </li>
      </ul>
    `;
    const avatar = document.querySelector('img[data-testid="github-avatar"]');
    const heading = document.querySelector("h2");

    require("../content.js");
    await flushPromises();

    expect(heading.textContent).toBe("Project User One");
    expect(avatar.getAttribute("alt")).toBe("Project User One");
    expect(heading.getAttribute("data-ghu-processed")).toBe("true");
  });

  test("should update username using 'up 3 parents' fallback", async () => {
    document.body.innerHTML = `
      <div class="grandparent">
        <div class="parent">
          <span class="sibling-of-icon-wrapper">
              <img data-testid="github-avatar" alt="projectUser2" src="#" />
          </span>
        </div>
        <div class="uncle-contains-heading">
           <h5>projectUser2</h5>
        </div>
      </div>
    `;
    const avatar = document.querySelector('img[data-testid="github-avatar"]');
    const heading = document.querySelector("h5");

    require("../content.js");
    await flushPromises();

    expect(heading.textContent).toBe("Project User Two");
    expect(avatar.getAttribute("alt")).toBe("Project User Two");
    expect(heading.getAttribute("data-ghu-processed")).toBe("true");
  });

  test("should update dynamically added project items (MutationObserver, primary traversal)", async () => {
    require("../content.js");

    const dynamicContentContainer = document.createElement("div");
    document.body.appendChild(dynamicContentContainer);

    const projectItemRoot = document.createElement("div");
    projectItemRoot.innerHTML = `
      <div class="leading-visual-wrapper-generic">
        <div class="icon-wrapper-generic">
          <img data-testid="github-avatar" alt="projectUser1" src="#" />
        </div>
      </div>
      <div class="main-content-wrapper-generic">
        <h3>projectUser1</h3>
      </div>
    `;
    dynamicContentContainer.appendChild(projectItemRoot);

    const avatar = projectItemRoot.querySelector(
      'img[data-testid="github-avatar"]'
    );
    const h3 = projectItemRoot.querySelector("h3");

    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));

    expect(h3.textContent).toBe("Project User One");
    expect(avatar.getAttribute("alt")).toBe("Project User One");
    expect(h3.getAttribute("data-ghu-processed")).toBe("true");
  });

  test("should not process 'No Assignees' in H3 (primary traversal) and not call fetch", async () => {
    const { avatar, heading } = setupPrimaryDOM("No Assignees", "h3");
    avatar.setAttribute("alt", "");

    const fetchSpy = global.fetch;

    require("../content.js");
    await flushPromises();

    expect(heading.textContent).toBe("No Assignees");
    expect(heading.hasAttribute("data-ghu-processed")).toBe(false);

    let calledForNoAssignees = false;
    for (const call of fetchSpy.mock.calls) {
      if (
        call[0].includes("/No%20Assignees") ||
        call[0].includes("/No Assignees")
      ) {
        calledForNoAssignees = true;
        break;
      }
    }
    expect(calledForNoAssignees).toBe(false);
    let sendMessageForNoAssignees = false;
    for (const call of global.chrome.runtime.sendMessage.mock.calls) {
      if (
        call[0].type === "acquireLock" &&
        call[0].username === "No Assignees"
      ) {
        sendMessageForNoAssignees = true;
        break;
      }
    }
    expect(sendMessageForNoAssignees).toBe(false);
  });
});
