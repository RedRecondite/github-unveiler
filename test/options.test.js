// test/options.test.js

const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function setOptionsHTML() {
  document.body.innerHTML = `
    <img id="optionsLogo" src="icon128.png" alt="Extension Logo">
    <h1>GitHub Unveiler Options</h1>
    <section>
      <h2>Enabled GitHub Domains</h2>
      <ul id="enabledDomainsList"></ul>
    </section>
    <section>
      <h2>Name Replacements</h2>
      <table id="nameReplacementsTable">
        <thead>
          <tr>
            <th>Origin</th>
            <th>Username</th>
            <th>Display Name</th>
            <th>Do Not Expire</th>
            <th>Expiration Date</th>
          </tr>
        </thead>
        <tbody id="nameReplacementsBody"></tbody>
      </table>
    </section>
    <script src="../options.js"></script>
  `;
}

describe('options.js', () => {
  let fakeStorageCache;
  let initialTimestamp;
  let optionsScriptMainFunction;

  beforeEach(() => {
    jest.resetModules();
    initialTimestamp = Date.now() - 10 * 24 * 60 * 60 * 1000;

    setOptionsHTML(); // This now includes the logo
    fakeStorageCache = {};

    global.chrome = {
      permissions: {
        getAll: jest.fn((callback) => {
          const error = global.chrome.runtime.lastError;
          callback(error ? null : { origins: [] });
        }),
      },
      storage: {
        local: {
          get: jest.fn((keys, callback) => {
            const error = global.chrome.runtime.lastError;
            const resultData = error ? null : { githubDisplayNameCache: JSON.parse(JSON.stringify(fakeStorageCache || {})) };
            callback(resultData);
          }),
          set: jest.fn((obj, callback) => {
            if (global.chrome.runtime.lastError) {
                if (callback) callback(global.chrome.runtime.lastError);
                return;
            }
            if (obj.githubDisplayNameCache) {
              fakeStorageCache = JSON.parse(JSON.stringify(obj.githubDisplayNameCache));
            }
            if (callback) callback();
          }),
        },
      },
      runtime: { lastError: null }
    };

    global.alert = jest.fn();
    global.confirm = jest.fn(() => true);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const originalAddEventListener = document.addEventListener;
    let capturedDOMContentLoadedCallback = null;
    document.addEventListener = (type, listener) => {
      if (type === 'DOMContentLoaded') capturedDOMContentLoadedCallback = listener;
      else originalAddEventListener(type, listener);
    };
    require('../options.js');
    document.addEventListener = originalAddEventListener;
    optionsScriptMainFunction = capturedDOMContentLoadedCallback;
    expect(optionsScriptMainFunction).not.toBeNull();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
    if (global.chrome.runtime) delete global.chrome.runtime.lastError;
    optionsScriptMainFunction = null;
  });

  test('should include the logo image', () => {
    expect(document.getElementById('optionsLogo')).not.toBeNull();
    expect(document.getElementById('optionsLogo').alt).toBe('Extension Logo');
    expect(document.getElementById('optionsLogo').src).toContain('icon128.png');
  });


  describe('Loading Data', () => {
    test('should load, sort, display existing name replacements with clickable usernames', async () => {
      const ts1 = initialTimestamp;
      const ts2 = Date.now() - 3 * SEVEN_DAYS;
      const ts3 = Date.now() - 15 * SEVEN_DAYS;

      fakeStorageCache = {
        'github.com': {
          'userC': { displayName: 'Charlie', timestamp: ts1, noExpire: true },
          'userA': { displayName: 'Alice', timestamp: ts2 },
        },
        'another.com': {
          'userB': { displayName: 'Bob', timestamp: ts3, noExpire: false }
        }
      };

      optionsScriptMainFunction();
      await flushPromises();

      const body = document.getElementById('nameReplacementsBody');
      expect(body.rows.length).toBe(3);

      const expectedOrder = [
        { username: 'userA', origin: 'github.com', data: fakeStorageCache['github.com']['userA'] },
        { username: 'userB', origin: 'another.com', data: fakeStorageCache['another.com']['userB'] },
        { username: 'userC', origin: 'github.com', data: fakeStorageCache['github.com']['userC'] },
      ];

      Array.from(body.rows).forEach((row, index) => {
        const expectedEntry = expectedOrder[index];
        // Check row ID
        expect(row.id).toBe(expectedEntry.username);

        const usernameCell = row.cells[1];
        expect(usernameCell.children.length).toBe(1);
        const anchorElement = usernameCell.firstElementChild;
        expect(anchorElement).not.toBeNull();
        expect(anchorElement.tagName).toBe('A');
        expect(anchorElement.href).toBe(`https://${expectedEntry.origin}/${expectedEntry.username}`);
        expect(anchorElement.textContent).toBe(expectedEntry.username);
        expect(anchorElement.target).toBe('_blank');

        // Check other cells based on expectedEntry
        expect(row.cells[0].textContent).toBe(expectedEntry.origin);
        expect(row.cells[2].querySelector('input').value).toBe(expectedEntry.data.displayName);
        expect(row.cells[3].querySelector('input').checked).toBe(!!expectedEntry.data.noExpire);

        const expirationDateCell = row.cells[4];
        if (expectedEntry.data.noExpire) {
            expect(expirationDateCell.textContent).toBe('Never');
        } else {
            expect(expirationDateCell.textContent).toBe(new Date(expectedEntry.data.timestamp + SEVEN_DAYS).toLocaleString());
        }
        expect(row.cells[5]).toBeUndefined(); // No Actions cell
      });
    });

    // ... other loading tests ...

    test('loadNameReplacements should set id attribute on table rows', async () => {
      const mockUsers = {
        "user1": { displayName: "User One", timestamp: Date.now(), noExpire: false },
        "user2": { displayName: "User Two", timestamp: Date.now(), noExpire: true }
      };
      fakeStorageCache = { "https://github.com": mockUsers };

      optionsScriptMainFunction(); // This calls loadNameReplacements internally
      await flushPromises();

      const body = document.getElementById('nameReplacementsBody');
      const rows = body.querySelectorAll('tr');
      // Assuming only users from one origin for simplicity in this specific cache setup
      expect(rows.length).toBe(Object.keys(mockUsers).length);

      for (const username in mockUsers) {
        const userRow = body.querySelector(`#${username}`);
        expect(userRow).not.toBeNull();
        if (userRow) {
          expect(userRow.tagName).toBe('TR');
          // Verify it's the correct row by checking some data point if necessary
          // For example, check the username cell's text content if it's simple
          const usernameCell = userRow.cells[1]; // Assuming username is in the second cell
          expect(usernameCell.textContent).toBe(username);
        }
      }
    });
  });

  describe('Display Name and Interaction Logic', () => {
    // ... existing interaction tests ...
    beforeAll(() => { jest.useFakeTimers(); });
    afterAll(() => { jest.useRealTimers(); });

    let testUserOrigin = 'github.com';
    let testUserUsername = 'testUser';
    let initialUserEntry;

    beforeEach(() => {
      initialUserEntry = { displayName: 'Initial Name', timestamp: initialTimestamp, noExpire: false };
      fakeStorageCache = {
        [testUserOrigin]: { [testUserUsername]: { ...initialUserEntry } }
      };
      optionsScriptMainFunction();
      jest.runOnlyPendingTimers();
      if (global.chrome.storage.local.set.mockClear) {
          global.chrome.storage.local.set.mockClear();
      }
    });

    test('changing Display Name should auto-save, set noExpire, and update Expiration Date to Never', () => {
      const newDisplayName = 'Updated Auto Name';
      const row = document.querySelector(`#nameReplacementsBody tr[data-username="${testUserUsername}"]`);
      const displayNameInput = row.cells[2].querySelector('input[type="text"]');
      const noExpireCheckbox = row.cells[3].querySelector('input[type="checkbox"]');
      const expirationDateCell = row.cells[4];

      displayNameInput.value = newDisplayName;
      displayNameInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      jest.advanceTimersByTime(1000);

      expect(global.chrome.storage.local.set).toHaveBeenCalledTimes(1);
      const savedEntry = fakeStorageCache[testUserOrigin][testUserUsername];
      expect(savedEntry.displayName).toBe(newDisplayName);
      expect(savedEntry.noExpire).toBe(true);
      expect(noExpireCheckbox.checked).toBe(true);
      expect(expirationDateCell.textContent).toBe('Never');
    });
  });
});
