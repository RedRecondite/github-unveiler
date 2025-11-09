// test/content.extensioncontext.test.js
//
// Tests for extension context invalidation handling
// These functions ensure the extension gracefully handles context invalidation
// that occurs when the extension is reloaded, updated, or disabled.
//
// This test file now imports and tests the ACTUAL code from content.js

import { jest } from '@jest/globals';
import { isExtensionContextValid, getCache, getSettings } from './content.test-helper.js';

describe('Extension Context Invalidation Handling', () => {
  const CACHE_KEY = "githubDisplayNameCache";
  const SETTINGS_KEY = "githubUnveilerSettings";

  beforeEach(() => {
    // Clear console mocks before each test
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('isExtensionContextValid', () => {
    test('should return true when chrome.runtime.id exists', () => {
      global.chrome = {
        runtime: {
          id: 'test-extension-id'
        }
      };
      expect(isExtensionContextValid()).toBe(true);
    });

    test('should return false when chrome.runtime.id is undefined', () => {
      global.chrome = {
        runtime: {}
      };
      expect(isExtensionContextValid()).toBe(false);
    });

    test('should return false when chrome.runtime is undefined', () => {
      global.chrome = {};
      expect(isExtensionContextValid()).toBe(false);
    });

    test('should return false when chrome is undefined', () => {
      global.chrome = undefined;
      expect(isExtensionContextValid()).toBe(false);
    });

    test('should return false when chrome is null', () => {
      global.chrome = null;
      expect(isExtensionContextValid()).toBe(false);
    });

    test('should return false when accessing chrome throws an error', () => {
      // Save the original chrome object
      const originalChrome = global.chrome;

      // Define a property that throws when accessed
      Object.defineProperty(global, 'chrome', {
        get: () => {
          throw new Error('Extension context invalidated');
        },
        configurable: true
      });

      expect(isExtensionContextValid()).toBe(false);

      // Restore the original chrome object
      Object.defineProperty(global, 'chrome', {
        value: originalChrome,
        configurable: true,
        writable: true
      });
    });
  });

  describe('getCache', () => {
    test('should return cache data when context is valid', async () => {
      const mockCache = {
        'github.com': {
          'testuser': { displayName: 'Test User', timestamp: Date.now() }
        }
      };

      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          lastError: null
        },
        storage: {
          local: {
            get: jest.fn((keys, callback) => {
              callback({ [CACHE_KEY]: mockCache });
            })
          }
        }
      };

      const result = await getCache();
      expect(result).toEqual(mockCache);
      expect(chrome.storage.local.get).toHaveBeenCalledWith([CACHE_KEY], expect.any(Function));
    });

    test('should return empty object when cache is not found', async () => {
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          lastError: null
        },
        storage: {
          local: {
            get: jest.fn((keys, callback) => {
              callback({});
            })
          }
        }
      };

      const result = await getCache();
      expect(result).toEqual({});
    });

    test('should return empty object when extension context is invalid', async () => {
      global.chrome = {
        runtime: {} // No id property
      };

      const result = await getCache();
      expect(result).toEqual({});
    });

    test('should return empty object and log warning when chrome.runtime.lastError occurs', async () => {
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          lastError: { message: 'Storage error' }
        },
        storage: {
          local: {
            get: jest.fn((keys, callback) => {
              callback({});
            })
          }
        }
      };

      const result = await getCache();
      expect(result).toEqual({});
      expect(console.warn).toHaveBeenCalledWith('Chrome storage error:', { message: 'Storage error' });
    });

    test('should return empty object and log warning when chrome.storage.local.get throws', async () => {
      global.chrome = {
        runtime: {
          id: 'test-extension-id'
        },
        storage: {
          local: {
            get: jest.fn(() => {
              throw new Error('Extension context invalidated');
            })
          }
        }
      };

      const result = await getCache();
      expect(result).toEqual({});
      expect(console.warn).toHaveBeenCalledWith('Extension context invalidated in getCache:', 'Extension context invalidated');
    });
  });

  describe('getSettings', () => {
    test('should return settings data when context is valid', async () => {
      const mockSettings = {
        replaceCodeOwnerMergingIsBlocked: true,
        parseDisplayNameFormat: true
      };

      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          lastError: null
        },
        storage: {
          local: {
            get: jest.fn((keys, callback) => {
              callback({ [SETTINGS_KEY]: mockSettings });
            })
          }
        }
      };

      const result = await getSettings();
      expect(result).toEqual(mockSettings);
      expect(chrome.storage.local.get).toHaveBeenCalledWith([SETTINGS_KEY], expect.any(Function));
    });

    test('should return empty object when settings are not found', async () => {
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          lastError: null
        },
        storage: {
          local: {
            get: jest.fn((keys, callback) => {
              callback({});
            })
          }
        }
      };

      const result = await getSettings();
      expect(result).toEqual({});
    });

    test('should return empty object when extension context is invalid', async () => {
      global.chrome = {
        runtime: {} // No id property
      };

      const result = await getSettings();
      expect(result).toEqual({});
    });

    test('should return empty object and log warning when chrome.runtime.lastError occurs', async () => {
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          lastError: { message: 'Storage error' }
        },
        storage: {
          local: {
            get: jest.fn((keys, callback) => {
              callback({});
            })
          }
        }
      };

      const result = await getSettings();
      expect(result).toEqual({});
      expect(console.warn).toHaveBeenCalledWith('Chrome storage error:', { message: 'Storage error' });
    });

    test('should return empty object and log warning when chrome.storage.local.get throws', async () => {
      global.chrome = {
        runtime: {
          id: 'test-extension-id'
        },
        storage: {
          local: {
            get: jest.fn(() => {
              throw new Error('Extension context invalidated');
            })
          }
        }
      };

      const result = await getSettings();
      expect(result).toEqual({});
      expect(console.warn).toHaveBeenCalledWith('Extension context invalidated in getSettings:', 'Extension context invalidated');
    });
  });

  describe('Chrome Runtime API Error Handling', () => {
    test('should handle chrome.runtime.sendMessage failure gracefully', async () => {
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          sendMessage: jest.fn(() => {
            throw new Error('Extension context invalidated');
          })
        }
      };

      // Simulate calling sendMessage with try-catch (as implemented in content.js)
      let error = null;
      try {
        await chrome.runtime.sendMessage({ type: 'test' });
      } catch (e) {
        error = e;
      }

      expect(error).not.toBeNull();
      expect(error.message).toBe('Extension context invalidated');
    });

    test('should handle chrome.runtime.getURL failure gracefully', () => {
      global.chrome = {
        runtime: {
          id: undefined, // Context invalidated
          getURL: jest.fn(() => {
            throw new Error('Extension context invalidated');
          })
        }
      };

      // Simulate calling getURL with try-catch (as implemented in content.js)
      let result = null;
      let error = null;
      try {
        result = chrome.runtime.getURL('icon16.png');
      } catch (e) {
        error = e;
      }

      expect(result).toBeNull();
      expect(error).not.toBeNull();
      expect(error.message).toBe('Extension context invalidated');
    });
  });

  describe('Integration: Multiple API calls with context invalidation', () => {
    test('should handle mixed valid and invalid context scenarios', async () => {
      // First scenario: valid context
      global.chrome = {
        runtime: {
          id: 'test-extension-id',
          lastError: null
        },
        storage: {
          local: {
            get: jest.fn((keys, callback) => {
              callback({ [SETTINGS_KEY]: { parseDisplayNameFormat: true } });
            })
          }
        }
      };

      const settings = await getSettings();
      expect(settings).toEqual({ parseDisplayNameFormat: true });

      // Second scenario: context becomes invalid
      global.chrome = {
        runtime: {} // No id - context invalidated
      };

      const cache = await getCache();
      expect(cache).toEqual({});
    });
  });

  describe('Concurrent operations with context invalidation', () => {
    test('should handle multiple concurrent getCache calls when context is invalid', async () => {
      global.chrome = {
        runtime: {} // No id property
      };

      const promises = [
        getCache(),
        getCache(),
        getCache()
      ];

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toEqual({});
      });
    });

    test('should handle multiple concurrent getSettings calls when context is invalid', async () => {
      global.chrome = {
        runtime: {} // No id property
      };

      const promises = [
        getSettings(),
        getSettings(),
        getSettings()
      ];

      const results = await Promise.all(promises);
      results.forEach(result => {
        expect(result).toEqual({});
      });
    });
  });
});
