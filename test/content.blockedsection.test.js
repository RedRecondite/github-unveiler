// test/content.blockedsection.test.js
// Jest + JSDOM environment

const PROCESSED_MARKER = "data-ghu-processed";
const LEADING_PHRASE = "Waiting on code owner review from";
const CACHE_KEY = "githubDisplayNameCache";

// Minimal implementation of getCache used by the production code
function getCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CACHE_KEY], (result) => {
      resolve(result[CACHE_KEY] || {});
    });
  });
}

// Function under test adapted for testing
async function processBlockedSectionMessages(root, displayNames) {
  if (!(root instanceof Element)) return;

  const section = root.matches('[aria-label="Merging is blocked"]')
    ? root
    : root.querySelector('[aria-label="Merging is blocked"]');
  if (!section) return;

  const msgEl = section.querySelector('[class*="BlockedSectionMessage"]');
  if (!msgEl || msgEl.hasAttribute(PROCESSED_MARKER)) return;

  const originalText = msgEl.textContent || "";
  const hasLeadingPhrase = originalText.startsWith(LEADING_PHRASE);

  let serverCache = {};
  try {
    const cache = await getCache();
    serverCache = cache[location.hostname] || {};
  } catch (_) {
    // ignore
  }

  if (!hasLeadingPhrase) {
    msgEl.setAttribute(PROCESSED_MARKER, "true");
    return;
  }

  const remainder = originalText.slice(LEADING_PHRASE.length); // may start with space
  const tokenRegex = /@?[A-Za-z\d_](?:[A-Za-z\d_]|-(?=[A-Za-z\d_])){0,38}/g;
  const tokens = remainder.match(tokenRegex) || [];

  const seen = new Set();
  const resolvedNames = [];

  tokens.forEach((tok) => {
    const candidate = tok.startsWith("@") ? tok.slice(1) : tok;
    const display =
      displayNames[candidate] ||
      (serverCache[candidate] && serverCache[candidate].displayName);
    if (display) {
      const cleanDisplay = display.startsWith(LEADING_PHRASE)
        ? display.slice(LEADING_PHRASE.length).trim()
        : display.trim();
      if (!seen.has(candidate)) {
        seen.add(candidate);
        resolvedNames.push(cleanDisplay);
      }
    }
  });

  if (resolvedNames.length > 0) {
    msgEl.textContent = LEADING_PHRASE + ":  " + resolvedNames.join(" - ");
  } else {
    msgEl.setAttribute(PROCESSED_MARKER, "true");
    return;
  }
  msgEl.setAttribute(PROCESSED_MARKER, "true");
}

// --- Tests ---

describe("processBlockedSectionMessages formatting", () => {
  beforeAll(() => {
    global.chrome = {
      storage: {
        local: {
          get: jest.fn((keys, cb) =>
            cb({
              [CACHE_KEY]: {
                [location.hostname]: {
                  user1: { displayName: "Display One" },
                  user2: { displayName: "Display Two" },
                },
              },
            })
          ),
        },
      },
    };
    global.location = { hostname: "github.com" };
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    jest.clearAllMocks();
  });

  test("rebuilds message with display names joined by - and adds processed marker", async () => {
    const container = document.createElement("div");
    container.setAttribute("aria-label", "Merging is blocked");
    const msg = document.createElement("div");
    msg.className = "BlockedSectionMessage";
    msg.textContent = LEADING_PHRASE + " user1 user2"; // original message with usernames
    container.appendChild(msg);
    document.body.appendChild(container);

    const displayNames = { user1: "Display One", user2: "Display Two" }; // Simulate already cached display names
    await processBlockedSectionMessages(document.body, displayNames);

    expect(msg.textContent).toBe(
      LEADING_PHRASE + ":  Display One - Display Two"
    );
    expect(msg.hasAttribute(PROCESSED_MARKER)).toBe(true);
  });
});
