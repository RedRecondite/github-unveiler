// background.test.js

// We assume background.js is in the same folder.
// The tests below reset the module and set up our own global.chrome mocks.
describe("background.js", () => {
  // We'll capture the listener callbacks for the events so we can call them in our tests.
  let onClickedCallback, onUpdatedCallback, onMessageCallback;
  const CACHE_KEY = "githubDisplayNameCache";
  const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000; // Added for new tests
  let fakeStorage;

  // For Date.now mocking
  let originalDateNow;

  beforeEach(() => {
    // Reset modules so that background.js re‑registers its listeners with our mocks.
    jest.resetModules();

    // Create an in-memory storage for chrome.storage.local.
    fakeStorage = {}; // Reset for each test

    // Set up our global.chrome mock object.
    global.chrome = {
      action: {
        onClicked: {
          addListener: (callback) => {
            onClickedCallback = callback;
          },
        },
      },
      permissions: {
        request: jest.fn(),
        contains: jest.fn(),
      },
      tabs: {
        onUpdated: {
          addListener: (callback) => {
            onUpdatedCallback = callback;
          },
        },
        create: jest.fn(), // Mock for openOptionsPage if that test is kept
      },
      runtime: {
        onMessage: {
          addListener: (callback) => {
            onMessageCallback = callback;
          },
        },
        lastError: null,
        getURL: jest.fn(url => url), // Mock for openOptionsPage
      },
      scripting: {
        executeScript: jest.fn((options, callback) => {
          if (callback) callback();
        }),
      },
      storage: {
        local: {
          get: jest.fn((keys, callback) => {
            const result = {};
            const keysToProcess = Array.isArray(keys) ? keys : [keys];
            keysToProcess.forEach(key => {
                // Ensure deep clone to prevent tests from modifying the fakeStorage directly through a reference
                result[key] = JSON.parse(JSON.stringify(fakeStorage[key] || {}));
            });
             // background.js specifically requests { [CACHE_KEY]: {} } sometimes, handle this.
            if (keysToProcess.length === 1 && typeof keysToProcess[0] === 'object' && keysToProcess[0][CACHE_KEY]) {
                result[CACHE_KEY] = JSON.parse(JSON.stringify(fakeStorage[CACHE_KEY] || {}));
            } else if (keysToProcess.includes(CACHE_KEY)) {
                 result[CACHE_KEY] = JSON.parse(JSON.stringify(fakeStorage[CACHE_KEY] || {}));
            }
            callback(result);
          }),
          set: jest.fn((obj, callback) => {
            for (const key in obj) {
                // Ensure deep clone
                fakeStorage[key] = JSON.parse(JSON.stringify(obj[key]));
            }
            if (callback) callback();
          }),
        },
      },
    };

    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    
    // Date.now mocking setup
    originalDateNow = Date.now;
    Date.now = jest.fn(() => new Date('2023-01-15T12:00:00.000Z').getTime()); // Default mock time


    // Require the background script. clearOldCacheEntries is async.
    // Tests need to handle this. The `triggerAndAwaitClearOldCache` helper will be used.
    require("../background.js");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Date.now = originalDateNow; // Restore original Date.now
  });

  describe("chrome.action.onClicked", () => {
    it("should log an error if the tab has no URL", () => {
      const tab = { id: 1, url: null };
      onClickedCallback(tab);
      expect(console.error).toHaveBeenCalledWith("No URL found for the active tab.");
    });

    it("should log an error for an invalid URL", () => {
      const tab = { id: 1, url: "not-a-valid-url" };
      onClickedCallback(tab);
      expect(console.error).toHaveBeenCalledWith("Invalid URL:", tab.url);
    });

    it("should request permission and inject content script when permission is granted", () => {
      const tab = { id: 1, url: "https://example.com/page" };
      const expectedOriginPattern = "https://example.com/*";
      chrome.permissions.request.mockImplementation((options, callback) => {
        expect(options.origins).toContain(expectedOriginPattern);
        callback(true);
      });
      onClickedCallback(tab);
      expect(console.log).toHaveBeenCalledWith("Requesting permission for", expectedOriginPattern);
      expect(console.log).toHaveBeenCalledWith("Permission granted for", expectedOriginPattern);
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        { target: { tabId: tab.id }, files: ["content.js"] }, expect.any(Function)
      );
    });

    it("should log that permission was denied if not granted", () => {
      const tab = { id: 1, url: "https://example.com/page" };
      const expectedOriginPattern = "https://example.com/*";
      chrome.permissions.request.mockImplementation((options, callback) => { callback(false); });
      onClickedCallback(tab);
      expect(console.log).toHaveBeenCalledWith("Requesting permission for", expectedOriginPattern);
      expect(console.log).toHaveBeenCalledWith("Permission denied for", expectedOriginPattern);
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });
  });

  describe("chrome.tabs.onUpdated", () => {
    it("should do nothing if the tab status is not 'complete'", () => {
      const tab = { id: 1, url: "https://example.com/page" };
      onUpdatedCallback(tab.id, { status: "loading" }, tab);
      expect(chrome.permissions.contains).not.toHaveBeenCalled();
    });

    it("should do nothing for an invalid URL", () => {
      const tab = { id: 1, url: "not-a-valid-url" };
      onUpdatedCallback(tab.id, { status: "complete" }, tab);
      expect(chrome.permissions.contains).not.toHaveBeenCalled();
    });

    it("should auto inject the content script if permission is already granted", () => {
      const tab = { id: 1, url: "https://example.com/page" };
      const expectedOriginPattern = "https://example.com/*";
      chrome.permissions.contains.mockImplementation((options, callback) => {
        expect(options.origins).toContain(expectedOriginPattern);
        callback(true);
      });
      onUpdatedCallback(tab.id, { status: "complete" }, tab);
      expect(console.log).toHaveBeenCalledWith("Auto injecting content script for", expectedOriginPattern);
      expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
        { target: { tabId: tab.id }, files: ["content.js"] }, expect.any(Function)
      );
    });

    it("should not inject the content script if permission is not granted", () => {
      const tab = { id: 1, url: "https://example.com/page" };
      const expectedOriginPattern = "https://example.com/*";
      chrome.permissions.contains.mockImplementation((options, callback) => { callback(false); });
      onUpdatedCallback(tab.id, { status: "complete" }, tab);
      expect(console.log).toHaveBeenCalledWith("No permission for", expectedOriginPattern, "; content script not injected.");
      expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
    });
  });

  describe("chrome.runtime.onMessage (Lock and Basic Cache Update)", () => {
    // Original tests for acquireLock and basic releaseLock remain relevant
    it('should acquire a lock when one is not already held ("acquireLock")', () => {
      const message = { type: "acquireLock", origin: "https://example.com", username: "user1" };
      const sendResponse = jest.fn();
      onMessageCallback(message, null, sendResponse);
      expect(sendResponse).toHaveBeenCalledWith({ acquired: true });
    });

    it('should not acquire a lock if it is already held ("acquireLock")', () => {
      const message = { type: "acquireLock", origin: "https://example.com", username: "user1" };
      const sendResponse1 = jest.fn(); const sendResponse2 = jest.fn();
      onMessageCallback(message, null, sendResponse1);
      expect(sendResponse1).toHaveBeenCalledWith({ acquired: true });
      onMessageCallback(message, null, sendResponse2);
      expect(sendResponse2).toHaveBeenCalledWith({ acquired: false });
    });

    it('should update the cache (basic) and release the lock on "releaseLock" message', (done) => {
      const msgTime = new Date('2023-01-15T12:00:00.000Z').getTime();
      Date.now = jest.fn(() => msgTime); // Ensure timestamp is predictable

      const message = { type: "releaseLock", origin: "https://example.com", username: "user1", displayName: "User One" };
      const acquireResponse = jest.fn();
      onMessageCallback({ type: "acquireLock", origin: message.origin, username: message.username }, null, acquireResponse);
      expect(acquireResponse).toHaveBeenCalledWith({ acquired: true });

      const sendResponse = (response) => {
        try {
          expect(response).toEqual({ success: true });
          const storedCache = fakeStorage[CACHE_KEY];
          expect(storedCache[message.origin][message.username].displayName).toBe(message.displayName);
          expect(storedCache[message.origin][message.username].timestamp).toBe(msgTime); // Check timestamp
          // noExpire defaults to false, this is covered in detailed tests below
          const newResponse = jest.fn();
          onMessageCallback({ type: "acquireLock", origin: message.origin, username: message.username }, null, newResponse);
          expect(newResponse).toHaveBeenCalledWith({ acquired: true });
          done();
        } catch (error) { done(error); }
      };
      expect(onMessageCallback(message, null, sendResponse)).toBe(true);
    });
  });

  // --- Merged detailed cache tests ---
  describe("updateCache (Detailed noExpire Logic via onMessage 'releaseLock')", () => {
    async function triggerUpdateCache(origin, username, displayName, initialCacheState = {}) {
        fakeStorage[CACHE_KEY] = initialCacheState; // Set initial state for the test
        // Ensure lock can be acquired
        onMessageCallback({ type: "acquireLock", origin, username }, null, jest.fn());
        
        const promise = new Promise(resolve => {
            onMessageCallback(
                { type: "releaseLock", origin, username, displayName },
                null,
                (response) => { expect(response.success).toBe(true); resolve(); }
            );
        });
        await promise;
    }

    it("should add a new entry with noExpire: false by default", async () => {
      const currentTime = new Date('2023-01-16T00:00:00.000Z').getTime();
      Date.now = jest.fn(() => currentTime);
      
      await triggerUpdateCache('origin1', 'user1', 'User One', {});
      
      const cache = fakeStorage[CACHE_KEY];
      expect(cache.origin1.user1).toEqual({
        displayName: 'User One', timestamp: currentTime, noExpire: false,
      });
    });

    it("should preserve noExpire: true if existing entry had it", async () => {
      const initialTime = new Date('2023-01-10T00:00:00.000Z').getTime();
      const updateTime = new Date('2023-01-16T00:00:00.000Z').getTime();
      Date.now = jest.fn(() => updateTime);
      
      await triggerUpdateCache('origin1', 'user1', 'User One New Name', {
        origin1: { user1: { displayName: 'Old Name', timestamp: initialTime, noExpire: true } },
      });
      
      const cache = fakeStorage[CACHE_KEY];
      expect(cache.origin1.user1).toEqual({
        displayName: 'User One New Name', timestamp: updateTime, noExpire: true,
      });
    });

    it("should set noExpire: false if existing entry had noExpire: false", async () => {
      const initialTime = new Date('2023-01-10T00:00:00.000Z').getTime();
      const updateTime = new Date('2023-01-16T00:00:00.000Z').getTime();
      Date.now = jest.fn(() => updateTime);

      await triggerUpdateCache('origin1', 'user1', 'User One Updated', {
        origin1: { user1: { displayName: 'Old Name', timestamp: initialTime, noExpire: false } },
      });

      const cache = fakeStorage[CACHE_KEY];
      expect(cache.origin1.user1).toEqual({
        displayName: 'User One Updated', timestamp: updateTime, noExpire: false,
      });
    });

    it("should set noExpire: false if existing entry had no noExpire property", async () => {
      const initialTime = new Date('2023-01-10T00:00:00.000Z').getTime();
      const updateTime = new Date('2023-01-16T00:00:00.000Z').getTime();
      Date.now = jest.fn(() => updateTime);

      await triggerUpdateCache('origin1', 'user1', 'User One Mix', {
        origin1: { user1: { displayName: 'Old Name No Prop', timestamp: initialTime } },
      });

      const cache = fakeStorage[CACHE_KEY];
      expect(cache.origin1.user1).toEqual({
        displayName: 'User One Mix', timestamp: updateTime, noExpire: false,
      });
    });
  });

  describe("clearOldCacheEntries (Detailed Logic)", () => {
    // Helper to re-require background.js and wait for clearOldCacheEntries to complete
    async function triggerAndAwaitClearOldCache() {
        jest.resetModules(); // This is key to re-run top-level code in background.js
        const clearPromise = new Promise(resolve => {
            // Temporarily override set to know when clearOldCacheEntries's set call is done
            const originalStorageSet = global.chrome.storage.local.set;
            global.chrome.storage.local.set = jest.fn((data, cb) => {
                originalStorageSet(data, cb); // Call original to update fakeStorage
                resolve(); // Resolve promise when set is called
            });
             // Ensure 'get' provides the current state of fakeStorage for this specific run
            global.chrome.storage.local.get = jest.fn((keys, cb) => {
                const result = {};
                const keysToProcess = Array.isArray(keys) ? keys : [keys];
                keysToProcess.forEach(key => {
                    result[key] = JSON.parse(JSON.stringify(fakeStorage[key] || {}));
                });
                if (keysToProcess.length === 1 && typeof keysToProcess[0] === 'object' && keysToProcess[0][CACHE_KEY]) {
                     result[CACHE_KEY] = JSON.parse(JSON.stringify(fakeStorage[CACHE_KEY] || {}));
                } else if (keysToProcess.includes(CACHE_KEY)) {
                     result[CACHE_KEY] = JSON.parse(JSON.stringify(fakeStorage[CACHE_KEY] || {}));
                }
                cb(result);
            });

            require("../background.js"); // Executes clearOldCacheEntries
            // Restore original set immediately if background.js doesn't make further set calls
            // or if clearOldCacheEntries is synchronous in its set call.
            // Given it's async, this resolve in the mock is better.
        });
        // If clearOldCacheEntries makes no changes, set won't be called.
        // Add a timeout fallback for such cases to prevent test hanging.
        await Promise.race([clearPromise, new Promise(r => setTimeout(r, 50))]);
        // Restore the original set mock from beforeEach for other tests
        global.chrome.storage.local.set = jest.fn((obj, cb) => {
            for (const key in obj) fakeStorage[key] = JSON.parse(JSON.stringify(obj[key]));
            if (cb) cb();
        });
    }

    it("entry with noExpire: true is NOT cleared even if very old", async () => {
      const futureTime = new Date('2023-01-30T00:00:00.000Z').getTime();
      Date.now = jest.fn(() => futureTime);
      fakeStorage[CACHE_KEY] = {
        origin1: { userA: { displayName: 'User A', timestamp: futureTime - SEVEN_DAYS - 1000, noExpire: true } },
      };
      await triggerAndAwaitClearOldCache();
      expect(fakeStorage[CACHE_KEY].origin1.userA).toBeDefined();
    });

    it("old entry with noExpire: false IS cleared", async () => {
      const futureTime = new Date('2023-01-30T00:00:00.000Z').getTime();
      Date.now = jest.fn(() => futureTime);
      fakeStorage[CACHE_KEY] = {
        origin1: { userB: { displayName: 'User B', timestamp: futureTime - SEVEN_DAYS - 1000, noExpire: false } },
      };
      await triggerAndAwaitClearOldCache();
      expect(fakeStorage[CACHE_KEY].origin1).toBeUndefined();
    });

    it("old entry with noExpire undefined IS cleared", async () => {
      const futureTime = new Date('2023-01-30T00:00:00.000Z').getTime();
      Date.now = jest.fn(() => futureTime);
      fakeStorage[CACHE_KEY] = {
        origin1: { userB: { displayName: 'User B Legacy', timestamp: futureTime - SEVEN_DAYS - 1000 } },
      };
      await triggerAndAwaitClearOldCache();
      expect(fakeStorage[CACHE_KEY].origin1).toBeUndefined();
    });

    it("recent entry with noExpire: false is NOT cleared", async () => {
      const futureTime = new Date('2023-01-30T00:00:00.000Z').getTime();
      Date.now = jest.fn(() => futureTime);
      fakeStorage[CACHE_KEY] = {
        origin1: { userC: { displayName: 'User C', timestamp: futureTime - SEVEN_DAYS + 1000, noExpire: false } },
      };
      await triggerAndAwaitClearOldCache();
      expect(fakeStorage[CACHE_KEY].origin1.userC).toBeDefined();
    });
    
    it("origin is cleared if all its users are cleared", async () => {
      const futureTime = new Date('2023-01-30T00:00:00.000Z').getTime();
      Date.now = jest.fn(() => futureTime);
      fakeStorage[CACHE_KEY] = {
        originToClear: {
          userOld1: { displayName: 'Old 1', timestamp: futureTime - SEVEN_DAYS - 2000, noExpire: false },
          userOld2: { displayName: 'Old 2', timestamp: futureTime - SEVEN_DAYS - 1000 },
        },
        originToKeep: { userNew: { displayName: 'New', timestamp: futureTime - 1000, noExpire: false } }
      };
      await triggerAndAwaitClearOldCache();
      expect(fakeStorage[CACHE_KEY].originToClear).toBeUndefined();
      expect(fakeStorage[CACHE_KEY].originToKeep.userNew).toBeDefined();
    });

    it("empty/whitespace displayName of a kept entry is updated to username", async () => {
      const futureTime = new Date('2023-01-30T00:00:00.000Z').getTime();
      Date.now = jest.fn(() => futureTime);
      const oneDayAgo = futureTime - 1 * 24 * 60 * 60 * 1000;
      const eightDaysAgo = futureTime - 8 * 24 * 60 * 60 * 1000;

      fakeStorage[CACHE_KEY] = {
        "https://example.com": {
          emptyNoExpire: { displayName: "", timestamp: eightDaysAgo, noExpire: true },
          spaceRecent: { displayName: "   ", timestamp: oneDayAgo, noExpire: false },
          validNoExpire: { displayName: "Valid Name", timestamp: eightDaysAgo, noExpire: true },
          emptyToBeDeleted: { displayName: "", timestamp: eightDaysAgo, noExpire: false}
        }
      };
      await triggerAndAwaitClearOldCache();
      const originCache = fakeStorage[CACHE_KEY]["https://example.com"];
      expect(originCache.emptyNoExpire.displayName).toBe("emptyNoExpire");
      expect(originCache.spaceRecent.displayName).toBe("spaceRecent");
      expect(originCache.validNoExpire.displayName).toBe("Valid Name");
      expect(originCache.emptyToBeDeleted).toBeUndefined();
    });
  });
  
  // --- End of Merged detailed cache tests ---

  describe("injectContentScript (via chrome.scripting.executeScript)", () => {
    // Original tests for injectContentScript remain relevant
    it("should log an error if script injection fails", () => {
      chrome.scripting.executeScript.mockImplementation((options, callback) => {
        chrome.runtime.lastError = { message: "Injection failed" };
        callback();
      });
      const tab = { id: 1, url: "https://example.com/page" };
      chrome.permissions.request.mockImplementation((options, callback) => { callback(true); });
      onClickedCallback(tab);
      expect(console.error).toHaveBeenCalledWith("Script injection failed:", { message: "Injection failed" });
      chrome.runtime.lastError = null;
    });

    it("should log success when script injection succeeds", () => {
      const tab = { id: 1, url: "https://example.com/page" };
      chrome.permissions.request.mockImplementation((options, callback) => { callback(true); });
      chrome.runtime.lastError = null; // Ensure no error for this test
      chrome.scripting.executeScript.mockImplementation((options, callback) => { if (callback) callback(); }); // Ensure callback is called
      onClickedCallback(tab);
      expect(console.log).toHaveBeenCalledWith("Content script injected into tab", tab.id);
    });
  });
});
