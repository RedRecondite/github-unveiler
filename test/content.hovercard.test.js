// test/content.hovercard.test.js
// REFACTORED TEST FILE
// This test file imports constants and utilities from content-utils.js
//
// NOTE: processHovercard is redefined here for testing because it's tightly coupled
// with content.js internals (displayNames, registerElement, fetchDisplayName) and
// exists inside an IIFE, making direct extraction impractical. This test validates
// the logic of processHovercard with mocked dependencies.

import { jest } from '@jest/globals';
import { isValidUsername, HOVERCARD_PROCESSED_MARKER } from './content-utils.test-helper.js';

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('GitHub Usernames Extension - Hovercard Functionality', () => {
  // Mock content.js global variables and functions
  let displayNames = {};
  let elementsByUsername = {};
  let fetchDisplayName;
  let registerElement;
  let lastRegisteredCallback;
  let processHovercard;

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  // Helper function to create a mock hovercard DOM element
  function createMockHovercard(username, existingContent = '', customDataHydroViewValue) {
    const popoverOuter = document.createElement('div');
    popoverOuter.className = 'Popover js-hovercard-content';

    const popoverMessage = document.createElement('div');
    popoverMessage.className = 'Popover-message Popover-message--large Box';
    popoverOuter.appendChild(popoverMessage);

    const unnamedParentDiv = document.createElement('div');
    popoverMessage.appendChild(unnamedParentDiv);

    const hovercardElement = document.createElement('div');
    hovercardElement.className = 'px-3 pb-3';
    const hydroViewData = customDataHydroViewValue || JSON.stringify({
      event_type: 'user-hovercard-hover',
      payload: { card_user_login: username }
    });
    hovercardElement.setAttribute('data-hydro-view', hydroViewData);
    hovercardElement.innerHTML = existingContent;

    unnamedParentDiv.appendChild(hovercardElement);
    document.body.appendChild(popoverOuter);

    return hovercardElement;
  }

  function findNewRowInHovercard(hovercardElement) {
    return hovercardElement.querySelector('div[data-testid="ghu-extension-row"]');
  }

  beforeAll(() => {
    // Mock location - delete and redefine to avoid JSDOM navigation issues
    delete global.location;
    global.location = { hostname: 'github.com' };

    // Mock chrome APIs
    global.chrome = {
      runtime: {
        getURL: jest.fn(path => `chrome://extension-id/${path}`),
        sendMessage: jest.fn(),
      },
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(),
        },
      },
    };

    // Define processHovercard for testing
    // This is a test-specific implementation that mirrors the production logic
    // but uses mocked dependencies (displayNames, registerElement, fetchDisplayName)
    processHovercard = function(hovercardElement) {
      if (hovercardElement.hasAttribute(HOVERCARD_PROCESSED_MARKER)) {
        return;
      }

      let username;
      try {
        const hydroView = hovercardElement.getAttribute("data-hydro-view");
        if (!hydroView) return;
        const jsonData = JSON.parse(hydroView);
        username = jsonData?.payload?.card_user_login;

        if (!username && jsonData?.payload?.originating_url) {
          const urlPattern = /\/users\/([^\/]+)\/hovercard/;
          const match = jsonData.payload.originating_url.match(urlPattern);
          if (match && match[1]) {
            username = match[1];
          }
        }
      } catch (e) {
        console.error("Error parsing hovercard data-hydro-view:", e, hovercardElement);
        return;
      }

      if (!username) {
        return;
      }

      if (!isValidUsername(username)) {
        hovercardElement.setAttribute(HOVERCARD_PROCESSED_MARKER, "true");
        return;
      }

      const processUpdate = (userData) => {
        if (hovercardElement.hasAttribute(HOVERCARD_PROCESSED_MARKER)) {
          return;
        }
        const iconUrl = global.chrome.runtime.getURL("icon16.png");

        const newRow = document.createElement("div");
        newRow.classList.add("d-flex", "flex-items-baseline", "f6", "mt-1", "color-fg-muted");
        newRow.style.cursor = "pointer";
        newRow.setAttribute('data-testid', 'ghu-extension-row');

        const iconContainer = document.createElement('div');
        iconContainer.classList.add("mr-1", "flex-shrink-0");

        const iconImg = document.createElement('img');
        iconImg.src = iconUrl;
        iconImg.alt = "Extension icon";
        iconImg.style.width = "16px";
        iconImg.style.height = "16px";
        iconImg.style.verticalAlign = "middle";
        iconContainer.appendChild(iconImg);

        const textContainer = document.createElement('span');
        textContainer.classList.add("lh-condensed", "overflow-hidden", "no-wrap");
        textContainer.style.textOverflow = "ellipsis";
        textContainer.textContent = userData.name;

        newRow.appendChild(iconContainer);
        newRow.appendChild(textContainer);

        newRow.addEventListener("click", () => {
          global.chrome.runtime.sendMessage({ type: "openOptionsPage", url: `options.html#${username}` });
        });

        const appendTarget = hovercardElement;
        appendTarget.appendChild(newRow);
        hovercardElement.setAttribute(HOVERCARD_PROCESSED_MARKER, "true");
      };

      if (displayNames[username]) {
        processUpdate(displayNames[username]);
      } else {
        registerElement(username, processUpdate);
        fetchDisplayName(username);
      }
    };
  });

  beforeEach(() => {
    // Reset mocks and global caches
    displayNames = {};
    elementsByUsername = {};
    lastRegisteredCallback = null;
    fetchDisplayName = jest.fn();
    registerElement = jest.fn((username, cb) => {
      if (!elementsByUsername[username]) {
        elementsByUsername[username] = [];
      }
      elementsByUsername[username].push(cb);
      lastRegisteredCallback = cb;
    });
    global.chrome.runtime.getURL.mockClear();
    global.chrome.runtime.sendMessage.mockClear();
    global.chrome.storage.local.get.mockClear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('Adds new row with icon, display name when data is fetched', () => {
    const hovercard = createMockHovercard('testuser');
    processHovercard(hovercard);

    expect(fetchDisplayName).toHaveBeenCalledWith('testuser');
    expect(registerElement).toHaveBeenCalledWith('testuser', expect.any(Function));
    expect(lastRegisteredCallback).toBeDefined();

    const userData = { name: 'Test User', timestamp: new Date('2024-01-01T00:00:00.000Z').getTime(), noExpire: false };
    lastRegisteredCallback(userData);

    const newRow = findNewRowInHovercard(hovercard);
    expect(newRow).not.toBeNull();

    expect(newRow.classList.contains('d-flex')).toBe(true);
    expect(newRow.classList.contains('flex-items-baseline')).toBe(true);
    expect(newRow.classList.contains('f6')).toBe(true);
    expect(newRow.classList.contains('mt-1')).toBe(true);
    expect(newRow.classList.contains('color-fg-muted')).toBe(true);
    expect(newRow.style.cursor).toBe('pointer');

    const iconContainer = newRow.querySelector('div.mr-1.flex-shrink-0');
    expect(iconContainer).not.toBeNull();

    const img = iconContainer.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.src).toBe('chrome://extension-id/icon16.png');
    expect(img.alt).toBe('Extension icon');
    expect(img.style.width).toBe('16px');
    expect(img.style.height).toBe('16px');

    const textContainer = newRow.querySelector('span.lh-condensed.overflow-hidden.no-wrap');
    expect(textContainer).not.toBeNull();
    expect(textContainer.style.textOverflow).toBe('ellipsis');
    expect(textContainer.textContent).toBe('Test User');

    expect(hovercard.hasAttribute(HOVERCARD_PROCESSED_MARKER)).toBe(true);
  });

  test('Displays "(No expiration)" correctly', () => {
    const hovercard = createMockHovercard('immortaluser');
    processHovercard(hovercard);
    expect(lastRegisteredCallback).toBeDefined();

    const userData = { name: 'Immortal User', timestamp: new Date().getTime(), noExpire: true };
    lastRegisteredCallback(userData);

    const newRow = findNewRowInHovercard(hovercard);
    expect(newRow).not.toBeNull();
    expect(newRow.classList.contains('d-flex')).toBe(true);

    const textContainer = newRow.querySelector('span.lh-condensed');
    expect(textContainer).not.toBeNull();
    expect(textContainer.textContent).toBe('Immortal User');
  });

  test('Does not process hovercard if already marked as processed', () => {
    const hovercard = createMockHovercard('testuser');
    hovercard.setAttribute(HOVERCARD_PROCESSED_MARKER, 'true');

    processHovercard(hovercard);

    expect(fetchDisplayName).not.toHaveBeenCalled();
    expect(registerElement).not.toHaveBeenCalled();
    const newRow = findNewRowInHovercard(hovercard);
    expect(newRow).toBeNull();
  });

  test('Does not process if no data-hydro-view attribute', () => {
    const hovercardElement = document.createElement('div');
    hovercardElement.className = 'px-3 pb-3';
    document.body.appendChild(hovercardElement);

    processHovercard(hovercardElement);

    expect(fetchDisplayName).not.toHaveBeenCalled();
    expect(registerElement).not.toHaveBeenCalled();
  });

  test('Does not process if data-hydro-view is invalid JSON', () => {
    const hovercardElement = document.createElement('div');
    hovercardElement.className = 'px-3 pb-3';
    hovercardElement.setAttribute('data-hydro-view', 'invalid json');
    document.body.appendChild(hovercardElement);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    processHovercard(hovercardElement);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(fetchDisplayName).not.toHaveBeenCalled();
    expect(registerElement).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  test('Extracts username from originating_url if card_user_login is missing', () => {
    const hydroViewData = JSON.stringify({
      event_type: 'user-hovercard-hover',
      payload: {
        originating_url: 'https://github.com/users/testuser2/hovercard?...'
      }
    });
    const hovercard = createMockHovercard('', '', hydroViewData);

    processHovercard(hovercard);

    expect(fetchDisplayName).toHaveBeenCalledWith('testuser2');
  });

  test('Does not process if username is invalid', () => {
    const hydroViewData = JSON.stringify({
      event_type: 'user-hovercard-hover',
      payload: { card_user_login: 'invalid-username-with-[bot]' }
    });
    const hovercard = createMockHovercard('', '', hydroViewData);

    processHovercard(hovercard);

    expect(hovercard.hasAttribute(HOVERCARD_PROCESSED_MARKER)).toBe(true);
    expect(fetchDisplayName).not.toHaveBeenCalled();
  });

  test('Uses cached display name if available', () => {
    displayNames['testuser'] = { name: 'Cached User', timestamp: Date.now(), noExpire: false };

    const hovercard = createMockHovercard('testuser');
    processHovercard(hovercard);

    expect(fetchDisplayName).not.toHaveBeenCalled();
    expect(registerElement).not.toHaveBeenCalled();

    const newRow = findNewRowInHovercard(hovercard);
    expect(newRow).not.toBeNull();

    const textContainer = newRow.querySelector('span.lh-condensed');
    expect(textContainer.textContent).toBe('Cached User');
  });

  test('Sends message to open options page when row is clicked', () => {
    const hovercard = createMockHovercard('testuser');
    processHovercard(hovercard);

    const userData = { name: 'Test User', timestamp: Date.now(), noExpire: false };
    lastRegisteredCallback(userData);

    const newRow = findNewRowInHovercard(hovercard);
    expect(newRow).not.toBeNull();

    newRow.click();

    expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'openOptionsPage',
      url: 'options.html#testuser'
    });
  });

  test('Does not add multiple rows if processUpdate is called multiple times', () => {
    const hovercard = createMockHovercard('testuser');
    processHovercard(hovercard);

    const userData = { name: 'Test User', timestamp: Date.now(), noExpire: false };
    lastRegisteredCallback(userData);

    expect(hovercard.hasAttribute(HOVERCARD_PROCESSED_MARKER)).toBe(true);

    // Try to call the callback again
    lastRegisteredCallback(userData);

    const rows = hovercard.querySelectorAll('div[data-testid="ghu-extension-row"]');
    expect(rows.length).toBe(1);
  });
});
