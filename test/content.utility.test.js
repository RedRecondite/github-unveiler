// test/content.utility.test.js
//
// REFACTORED TEST FILE
// This test file now imports and tests the ACTUAL code from content-utils.js
// instead of duplicating the implementation.

import { isValidUsername, isBotUsername, getUsername, KNOWN_BOT_PATTERNS } from '../content-utils.js';

// --- Tests Start Here ---
describe('isValidUsername', () => {
  // Valid usernames
  test('should return true for valid usernames', () => {
    expect(isValidUsername('jules-engineer')).toBe(true);
    expect(isValidUsername('user123')).toBe(true);
    expect(isValidUsername('u-s-e-r')).toBe(true);
    expect(isValidUsername('a')).toBe(true);
    expect(isValidUsername('1')).toBe(true);
    expect(isValidUsername('a1-b2-c3')).toBe(true);
    expect(isValidUsername('maxlengthusernameisexactly39charslong')).toBe(true); // 39 chars
  });

  // Invalid usernames: null, empty, too long
  test('should return false for null or empty usernames', () => {
    expect(isValidUsername(null)).toBe(false);
    expect(isValidUsername('')).toBe(false);
  });

  test('should return false for usernames that are too long', () => {
    expect(isValidUsername('thisusernameiswaytoolongandshouldfailvalidation')).toBe(false); // > 39 chars
  });

  // Invalid usernames: starting/ending with hyphen, consecutive hyphens
  test('should return false for usernames starting or ending with a hyphen', () => {
    expect(isValidUsername('-invalid')).toBe(false);
    expect(isValidUsername('invalid-')).toBe(false);
  });

  test('should return false for usernames with consecutive hyphens', () => {
    expect(isValidUsername('invalid--username')).toBe(false);
  });

  // Invalid usernames: special characters, spaces
  test('should return false for usernames with invalid characters', () => {
    expect(isValidUsername('invalid username')).toBe(false); // space
    expect(isValidUsername('invalid@username')).toBe(false); // @
    expect(isValidUsername('invalid!username')).toBe(false); // !
    expect(isValidUsername('Change `suppressInlineSuggestions` to be a string (and thus exp controllable) (#252351)')).toBe(false);
  });

  // Note: Underscores ARE valid in GitHub usernames
  test('should return true for usernames with underscores', () => {
    expect(isValidUsername('valid_username')).toBe(true); // GitHub allows underscores
    expect(isValidUsername('_username')).toBe(true);
    expect(isValidUsername('user_name_123')).toBe(true);
  });

  test('should return false for path-like strings', () => {
    expect(isValidUsername('users/login')).toBe(false);
    expect(isValidUsername('login/oauth/authorize')).toBe(false);
  });
});

describe('isBotUsername', () => {
  test('should return true for known bot names and patterns', () => {
    expect(isBotUsername('Copilot')).toBe(true);
    expect(isBotUsername('copilot')).toBe(true);
    expect(isBotUsername('dependabot[bot]')).toBe(true);
    expect(isBotUsername('github-actions[bot]')).toBe(true);
    expect(isBotUsername('renovate-bot')).toBe(true);
    expect(isBotUsername('some-bot')).toBe(true);
    expect(isBotUsername('bot-experimental')).toBe(true);
    expect(isBotUsername('netlify[bot]')).toBe(true);
  });

  test('should return false for regular usernames', () => {
    expect(isBotUsername('jules-engineer')).toBe(false);
    expect(isBotUsername('notabot')).toBe(false);
    expect(isBotUsername('someuserbotnotreally')).toBe(false);
  });

  test('should correctly identify bot if username ends with [bot] or -bot', () => {
    expect(isBotUsername('my-special-bot')).toBe(true);
    expect(isBotUsername('another[bot]')).toBe(true);
    expect(isBotUsername('bot-leader')).toBe(true);
    expect(isBotUsername('robot')).toBe(false);
  });

  test('should return false for null or empty usernames', () => {
    expect(isBotUsername(null)).toBe(false);
    expect(isBotUsername('')).toBe(false);
  });

  test('should verify KNOWN_BOT_PATTERNS is exported and accessible', () => {
    expect(KNOWN_BOT_PATTERNS).toBeDefined();
    expect(Array.isArray(KNOWN_BOT_PATTERNS)).toBe(true);
    expect(KNOWN_BOT_PATTERNS).toContain('bot');
    expect(KNOWN_BOT_PATTERNS).toContain('copilot');
  });
});

describe('HTML Snippet Problem Handling', () => {
  test('should identify invalid alt text from the first example', () => {
    const altText = "@Change suppressInlineSuggestions to be a string (and thus exp controllable) (#252351)";
    const extractedUsername = altText.replace("@", "").trim();
    expect(isValidUsername(extractedUsername)).toBe(false);
  });

  test('should identify "Copilot" as a bot from the second example alt text', () => {
    const altText = "Copilot";
    const extractedUsername = altText.replace("@", "").trim();
    expect(isValidUsername(extractedUsername)).toBe(true);
    expect(isBotUsername(extractedUsername)).toBe(true);
  });
});

// --- Tests for getUsername ---

describe('getUsername', () => {
  const createMockAnchor = ({ href, hovercardUrl }) => {
    // JSDOM environment is provided by Jest config
    const anchor = document.createElement('a');
    if (href) anchor.setAttribute('href', href);
    if (hovercardUrl) anchor.setAttribute('data-hovercard-url', hovercardUrl);
    return anchor;
  };

  test('should extract username from data-hovercard-url (e.g., /users/RedRecondite/hovercard)', () => {
    const anchor = createMockAnchor({ hovercardUrl: '/users/RedRecondite/hovercard' });
    expect(getUsername(anchor)).toBe('RedRecondite');
  });

  test('should extract username from data-hovercard-url (e.g., /users/rzhao271/hovercard)', () => {
    const anchor = createMockAnchor({ hovercardUrl: '/users/rzhao271/hovercard' });
    expect(getUsername(anchor)).toBe('rzhao271');
  });

  test('should extract username from data-hovercard-url with query params', () => {
    const anchor = createMockAnchor({ hovercardUrl: '/users/test-user/hovercard?from=source' });
    expect(getUsername(anchor)).toBe('test-user');
  });

  test('should prioritize data-hovercard-url over href', () => {
    const anchor = createMockAnchor({ hovercardUrl: '/users/hover-user/hovercard', href: '/href-user' });
    expect(getUsername(anchor)).toBe('hover-user');
  });

  test('should extract username from simple href (e.g., /RedRecondite) if no hovercard URL', () => {
    const anchor = createMockAnchor({ href: '/RedRecondite' });
    expect(getUsername(anchor)).toBe('RedRecondite');
  });

  test('should extract username from href with allowed subpaths (e.g., /user/issues)', () => {
    const anchor = createMockAnchor({ href: '/someuser/issues' });
    expect(getUsername(anchor)).toBe('someuser');
  });

  test('should extract username from href with query param (e.g., /user?tab=stars)', () => {
    const anchor = createMockAnchor({ href: '/another-user?tab=stars' });
    expect(getUsername(anchor)).toBe('another-user');
  });

  test('should return null for complex hrefs not matching user profile patterns if no hovercard URL', () => {
    const anchor1 = createMockAnchor({ href: '/RedRecondite/bird-buddy-bot/commits?author=RedRecondite' });
    expect(getUsername(anchor1)).toBeNull();
  });

  test('should correctly parse complex href if data-hovercard-url is present and correct', () => {
    const anchor2 = createMockAnchor({
        href: '/RedRecondite/bird-buddy-bot/commits?author=RedRecondite',
        hovercardUrl: '/users/RedRecondite/hovercard'
    });
    expect(getUsername(anchor2)).toBe('RedRecondite');
  });

  test('should return null for blacklisted href paths (e.g., /orgs/test)', () => {
    const anchor = createMockAnchor({ href: '/orgs/testorg' });
    expect(getUsername(anchor)).toBeNull();
  });

  test('should return null for invalid usernames from hovercard URL', () => {
    const anchor = createMockAnchor({ hovercardUrl: '/users/Invalid--Username/hovercard' });
    expect(getUsername(anchor)).toBeNull();
  });

  test('should accept valid usernames with underscores from href', () => {
    // GitHub usernames CAN contain underscores
    const anchor = createMockAnchor({ href: '/Valid_Username' });
    expect(getUsername(anchor)).toBe('Valid_Username');
  });

  test('should return null for invalid usernames from href', () => {
    const anchor = createMockAnchor({ href: '/invalid--username' }); // consecutive hyphens
    expect(getUsername(anchor)).toBeNull();
  });

  test('should return null if username contains [bot] from hovercard', () => {
    const anchor = createMockAnchor({ hovercardUrl: '/users/dependabot[bot]/hovercard' });
    expect(getUsername(anchor)).toBeNull();
  });

  test('should return null for href like /login/oauth/authorize', () => {
    const anchor = createMockAnchor({ href: '/login/oauth/authorize' });
    expect(getUsername(anchor)).toBeNull();
  });

  test('should return null for href that is just /', () => {
    const anchor = createMockAnchor({ href: '/' });
    expect(getUsername(anchor)).toBeNull();
  });
});
