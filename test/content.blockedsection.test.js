// Test suite for processBlockedSectionMessages function
describe('GitHub Usernames Extension - processBlockedSectionMessages Functionality', () => {
  // Mock location FIRST, before anything else
  global.location = { hostname: 'github.com' };

  // Mock chrome APIs
  global.chrome = {
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(),
      },
    },
  };

  // Mock content.js global variables and functions
  const testGlobals = {
    displayNames: {},
    PROCESSED_MARKER: "data-ghu-processed",
    getSettings: jest.fn(),
    getCache: jest.fn(),
    parseDisplayNameFormat: jest.fn(),
    location: { hostname: 'github.com' }
  };

  let processBlockedSectionMessages;

  // Helper function for parseDisplayNameFormat implementation
  const parseDisplayNameFormatImpl = (displayName, enabled) => {
    if (!enabled || !displayName) return displayName;
    
    const commaCount = (displayName.match(/,/g) || []).length;
    const openParenCount = (displayName.match(/\(/g) || []).length;
    const closeParenCount = (displayName.match(/\)/g) || []).length;

    if (commaCount !== 1 || openParenCount !== 1 || closeParenCount !== 1) {
      return displayName;
    }

    const pattern = /^([^,]+),\s*([^(]+)\s*\([^)]+\)\s*$/;
    const match = displayName.match(pattern);

    if (match) {
      const lastName = match[1].trim();
      const firstName = match[2].trim();
      return `${firstName} ${lastName}`;
    }

    return displayName;
  };

  // Helper function to create a mock blocked section DOM element
  function createMockBlockedSection(messageText = 'Waiting on code owner review from @user1 @user2') {
    const section = document.createElement('div');
    section.setAttribute('aria-label', 'Merging is blocked');
    
    const msgEl = document.createElement('div');
    msgEl.className = 'BlockedSectionMessage-module_text';
    msgEl.textContent = messageText;
    
    section.appendChild(msgEl);
    document.body.appendChild(section);
    
    return { section, msgEl };
  }

  beforeAll(() => {
    // Set up mock implementation for parseDisplayNameFormat
    testGlobals.parseDisplayNameFormat.mockImplementation(parseDisplayNameFormatImpl);

    // Define processBlockedSectionMessages for testing
    processBlockedSectionMessages = async function(root) {
      if (!(root instanceof Element)) return;

      const settings = await testGlobals.getSettings();
      if (!settings.replaceCodeOwnerMergingIsBlocked) {
        return;
      }

      const section = root.matches('[aria-label="Merging is blocked"]')
        ? root
        : root.querySelector('[aria-label="Merging is blocked"]');
      if (!section) return;

      const msgEl = section.querySelector('[class*="BlockedSectionMessage"]');
      if (!msgEl || msgEl.hasAttribute(testGlobals.PROCESSED_MARKER)) return;

      const LEADING_PHRASE = 'Waiting on code owner review from';
      const originalText = msgEl.textContent || '';
      const hasLeadingPhrase = originalText.startsWith(LEADING_PHRASE);

      let serverCache = {};
      try {
        const cache = await testGlobals.getCache();
        serverCache = cache[testGlobals.location.hostname] || {};
      } catch (e) {
        // ignore cache errors
      }

      if (!hasLeadingPhrase) {
        msgEl.setAttribute(testGlobals.PROCESSED_MARKER, 'true');
        return;
      }

      const remainder = originalText.slice(LEADING_PHRASE.length);

      const tokenRegex = /@?[A-Za-z\d_](?:[A-Za-z\d_]|-(?=[A-Za-z\d_])){0,38}/g;
      const tokens = remainder.match(tokenRegex) || [];

      const seen = new Set();
      const resolvedNames = [];

      tokens.forEach(tok => {
        const candidate = tok.startsWith('@') ? tok.slice(1) : tok;
        const display =
          testGlobals.displayNames[candidate] ||
          (serverCache[candidate] && testGlobals.parseDisplayNameFormat(serverCache[candidate].displayName, settings.parseDisplayNameFormat));
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

      msgEl.setAttribute(testGlobals.PROCESSED_MARKER, 'true');

      if (resolvedNames.length > 0) {
        msgEl.textContent = LEADING_PHRASE + ':  ' + resolvedNames.join(' - ');
      }
    };
  });

  beforeEach(() => {
    // Clear the displayNames object properties instead of reassigning
    Object.keys(testGlobals.displayNames).forEach(key => delete testGlobals.displayNames[key]);
    
    // Reset mock implementations and restore them
    testGlobals.getSettings.mockClear();
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });
    
    testGlobals.getCache.mockClear();
    testGlobals.getCache.mockResolvedValue({});
    
    testGlobals.parseDisplayNameFormat.mockClear();
    testGlobals.parseDisplayNameFormat.mockImplementation(parseDisplayNameFormatImpl);
    
    chrome.storage.local.get.mockClear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('processes blocked section when feature flag is enabled', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    testGlobals.getCache.mockResolvedValue({
      'github.com': {
        'user1': { displayName: 'John Doe', timestamp: Date.now() },
        'user2': { displayName: 'Jane Smith', timestamp: Date.now() }
      }
    });

    const { section, msgEl } = createMockBlockedSection('Waiting on code owner review from @user1 @user2');
    
    await processBlockedSectionMessages(section);

    expect(msgEl.hasAttribute(testGlobals.PROCESSED_MARKER)).toBe(true);
    expect(msgEl.textContent).toBe('Waiting on code owner review from:  John Doe - Jane Smith');
  });

  test('does NOT process when feature flag is disabled', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: false,
      parseDisplayNameFormat: false
    });

    const originalText = 'Waiting on code owner review from @user1';
    const { section, msgEl } = createMockBlockedSection(originalText);
    
    await processBlockedSectionMessages(section);

    expect(msgEl.hasAttribute(testGlobals.PROCESSED_MARKER)).toBe(false);
    expect(msgEl.textContent).toBe(originalText);
  });

  test('marks as processed even when no display names are in cache', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    testGlobals.getCache.mockResolvedValue({});

    const originalText = 'Waiting on code owner review from @user1';
    const { section, msgEl } = createMockBlockedSection(originalText);
    
    await processBlockedSectionMessages(section);

    expect(msgEl.hasAttribute(testGlobals.PROCESSED_MARKER)).toBe(true);
    expect(msgEl.textContent).toBe(originalText); // Text unchanged since no names in cache
  });

  test('applies parseDisplayNameFormat to server cache values', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: true
    });

    testGlobals.getCache.mockResolvedValue({
      'github.com': {
        'user1': { displayName: 'Doe, John (Engineering)', timestamp: Date.now() }
      }
    });

    const { section, msgEl } = createMockBlockedSection('Waiting on code owner review from @user1');
    
    await processBlockedSectionMessages(section);

    expect(testGlobals.parseDisplayNameFormat).toHaveBeenCalledWith('Doe, John (Engineering)', true);
    expect(msgEl.textContent).toBe('Waiting on code owner review from:  John Doe');
  });

  test('does not process if message doesn\'t start with leading phrase', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    const originalText = 'This is some other message about @user1';
    const { section, msgEl } = createMockBlockedSection(originalText);
    
    await processBlockedSectionMessages(section);

    expect(msgEl.hasAttribute(testGlobals.PROCESSED_MARKER)).toBe(true);
    expect(msgEl.textContent).toBe(originalText); // Text unchanged
  });

  test('handles usernames with @ prefix', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    testGlobals.getCache.mockResolvedValue({
      'github.com': {
        'user1': { displayName: 'User One', timestamp: Date.now() },
        'user2': { displayName: 'User Two', timestamp: Date.now() }
      }
    });

    const { section, msgEl } = createMockBlockedSection('Waiting on code owner review from @user1 @user2');
    
    await processBlockedSectionMessages(section);

    expect(msgEl.textContent).toBe('Waiting on code owner review from:  User One - User Two');
  });

  test('handles usernames without @ prefix', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    testGlobals.getCache.mockResolvedValue({
      'github.com': {
        'user1': { displayName: 'User One', timestamp: Date.now() },
        'user2': { displayName: 'User Two', timestamp: Date.now() }
      }
    });

    const { section, msgEl } = createMockBlockedSection('Waiting on code owner review from user1 user2');
    
    await processBlockedSectionMessages(section);

    expect(msgEl.textContent).toBe('Waiting on code owner review from:  User One - User Two');
  });

  test('handles mixed usernames with and without @ prefix', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    testGlobals.getCache.mockResolvedValue({
      'github.com': {
        'user1': { displayName: 'User One', timestamp: Date.now() },
        'user2': { displayName: 'User Two', timestamp: Date.now() }
      }
    });

    const { section, msgEl } = createMockBlockedSection('Waiting on code owner review from @user1 user2');
    
    await processBlockedSectionMessages(section);

    expect(msgEl.textContent).toBe('Waiting on code owner review from:  User One - User Two');
  });

  test('uses displayNames cache in preference to server cache', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    testGlobals.displayNames['user1'] = 'Memory User';
    
    testGlobals.getCache.mockResolvedValue({
      'github.com': {
        'user1': { displayName: 'Server User', timestamp: Date.now() }
      }
    });

    const { section, msgEl } = createMockBlockedSection('Waiting on code owner review from @user1');
    
    await processBlockedSectionMessages(section);

    expect(msgEl.textContent).toBe('Waiting on code owner review from:  Memory User');
  });

  test('does not re-process if already marked as processed', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    const originalText = 'Waiting on code owner review from @user1';
    const { section, msgEl } = createMockBlockedSection(originalText);
    msgEl.setAttribute(testGlobals.PROCESSED_MARKER, 'true');
    
    await processBlockedSectionMessages(section);

    expect(msgEl.textContent).toBe(originalText); // Text unchanged
  });

  test('returns early if no section with aria-label found', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    const div = document.createElement('div');
    document.body.appendChild(div);
    
    await processBlockedSectionMessages(div);

    expect(testGlobals.getSettings).toHaveBeenCalled();
  });

  test('returns early if no BlockedSectionMessage element found', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    const section = document.createElement('div');
    section.setAttribute('aria-label', 'Merging is blocked');
    document.body.appendChild(section);
    
    await processBlockedSectionMessages(section);

    expect(testGlobals.getSettings).toHaveBeenCalled();
  });

  test('handles multiple usernames and deduplicates', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    testGlobals.getCache.mockResolvedValue({
      'github.com': {
        'user1': { displayName: 'User One', timestamp: Date.now() },
        'user2': { displayName: 'User Two', timestamp: Date.now() }
      }
    });

    const { section, msgEl } = createMockBlockedSection('Waiting on code owner review from @user1 @user2 @user1');
    
    await processBlockedSectionMessages(section);

    expect(msgEl.textContent).toBe('Waiting on code owner review from:  User One - User Two');
  });

  test('strips accidental leading phrase from cached display names', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    testGlobals.getCache.mockResolvedValue({
      'github.com': {
        'user1': { displayName: 'Waiting on code owner review from User One', timestamp: Date.now() }
      }
    });

    const { section, msgEl } = createMockBlockedSection('Waiting on code owner review from @user1');
    
    await processBlockedSectionMessages(section);

    expect(msgEl.textContent).toBe('Waiting on code owner review from:  User One');
  });

  test('handles empty remainder after leading phrase', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    const { section, msgEl } = createMockBlockedSection('Waiting on code owner review from');
    
    await processBlockedSectionMessages(section);

    expect(msgEl.hasAttribute(testGlobals.PROCESSED_MARKER)).toBe(true);
    expect(msgEl.textContent).toBe('Waiting on code owner review from');
  });

  test('handles cache read errors gracefully', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    testGlobals.getCache.mockRejectedValue(new Error('Cache read error'));

    const { section, msgEl } = createMockBlockedSection('Waiting on code owner review from @user1');
    
    await processBlockedSectionMessages(section);

    expect(msgEl.hasAttribute(testGlobals.PROCESSED_MARKER)).toBe(true);
  });

  test('processes when root is the section itself', async () => {
    testGlobals.getSettings.mockResolvedValue({
      replaceCodeOwnerMergingIsBlocked: true,
      parseDisplayNameFormat: false
    });

    testGlobals.getCache.mockResolvedValue({
      'github.com': {
        'user1': { displayName: 'User One', timestamp: Date.now() }
      }
    });

    const { section, msgEl } = createMockBlockedSection('Waiting on code owner review from @user1');
    
    await processBlockedSectionMessages(section);

    expect(msgEl.textContent).toBe('Waiting on code owner review from:  User One');
  });
});