// test/content.displayname.test.js
//
// REFACTORED TEST FILE
// This test file now imports and tests the ACTUAL code from content-utils.js
// instead of duplicating the implementation.

import { parseDisplayNameFormat } from './content-utils.test-helper.js';

// --- Tests Start Here ---
describe('parseDisplayNameFormat', () => {
  describe('when feature is disabled', () => {
    test('should return original display name when disabled', () => {
      expect(parseDisplayNameFormat('Doe, John (Company)', false)).toBe('Doe, John (Company)');
      expect(parseDisplayNameFormat('Smith, Jane (Team)', false)).toBe('Smith, Jane (Team)');
    });

    test('should return original display name when enabled is undefined', () => {
      expect(parseDisplayNameFormat('Doe, John (Company)', undefined)).toBe('Doe, John (Company)');
    });

    test('should return undefined when displayName is null or undefined', () => {
      expect(parseDisplayNameFormat(null, false)).toBe(null);
      expect(parseDisplayNameFormat(undefined, false)).toBe(undefined);
    });
  });

  describe('when feature is enabled', () => {
    describe('should rewrite names in correct format', () => {
      test('should rewrite basic "LastName, FirstName (Something)" format', () => {
        expect(parseDisplayNameFormat('Doe, John (Company)', true)).toBe('John Doe');
        expect(parseDisplayNameFormat('Smith, Jane (Team)', true)).toBe('Jane Smith');
      });

      test('should handle names with extra spaces', () => {
        expect(parseDisplayNameFormat('Last Name, First Name (Company)', true)).toBe('First Name Last Name');
        expect(parseDisplayNameFormat('Van Der Berg, John (Team)', true)).toBe('John Van Der Berg');
      });

      test('should handle various content in parentheses', () => {
        expect(parseDisplayNameFormat('Doe, John (Engineering)', true)).toBe('John Doe');
        expect(parseDisplayNameFormat('Doe, John (he/him)', true)).toBe('John Doe');
        expect(parseDisplayNameFormat('Smith, Jane (Product Manager)', true)).toBe('Jane Smith');
        expect(parseDisplayNameFormat('Johnson, Bob (Contractor - Acme Corp)', true)).toBe('Bob Johnson');
      });

      test('should handle names with minimal spacing', () => {
        expect(parseDisplayNameFormat('Doe,John(Company)', true)).toBe('John Doe');
      });

      test('should handle names with extra whitespace', () => {
        expect(parseDisplayNameFormat('Doe,  John  (Company)  ', true)).toBe('John Doe');
        expect(parseDisplayNameFormat('  Smith  , Jane   ( Team )  ', true)).toBe('Jane Smith');
      });
    });

    describe('should NOT rewrite names that do not match the format', () => {
      test('should return original when no comma present', () => {
        expect(parseDisplayNameFormat('John Doe (Company)', true)).toBe('John Doe (Company)');
        expect(parseDisplayNameFormat('John Doe', true)).toBe('John Doe');
      });

      test('should return original when no parentheses present', () => {
        expect(parseDisplayNameFormat('Doe, John', true)).toBe('Doe, John');
        expect(parseDisplayNameFormat('Doe, John - Company', true)).toBe('Doe, John - Company');
      });

      test('should return original when multiple commas present', () => {
        expect(parseDisplayNameFormat('Doe, Jr., John (Company)', true)).toBe('Doe, Jr., John (Company)');
        expect(parseDisplayNameFormat('Smith, Jane, PhD (Team)', true)).toBe('Smith, Jane, PhD (Team)');
      });

      test('should return original when multiple parentheses present', () => {
        expect(parseDisplayNameFormat('Doe, John (Company) (Team)', true)).toBe('Doe, John (Company) (Team)');
        expect(parseDisplayNameFormat('Smith, Jane (he/him) (Company)', true)).toBe('Smith, Jane (he/him) (Company)');
      });

      test('should return original when mismatched parentheses', () => {
        expect(parseDisplayNameFormat('Doe, John (Company', true)).toBe('Doe, John (Company');
        expect(parseDisplayNameFormat('Doe, John Company)', true)).toBe('Doe, John Company)');
      });

      test('should return original for simple names without pattern', () => {
        expect(parseDisplayNameFormat('John Doe', true)).toBe('John Doe');
        expect(parseDisplayNameFormat('Jane Smith', true)).toBe('Jane Smith');
      });

      test('should return original when parentheses come before comma', () => {
        expect(parseDisplayNameFormat('(Company) Doe, John', true)).toBe('(Company) Doe, John');
      });
    });

    describe('edge cases', () => {
      test('should handle empty string', () => {
        expect(parseDisplayNameFormat('', true)).toBe('');
      });

      test('should handle names with numbers', () => {
        expect(parseDisplayNameFormat('Doe 2, John (Company)', true)).toBe('John Doe 2');
      });

      test('should handle names with special characters in parentheses', () => {
        expect(parseDisplayNameFormat('Doe, John (@company)', true)).toBe('John Doe');
        expect(parseDisplayNameFormat('Smith, Jane (team@company.com)', true)).toBe('Jane Smith');
      });

      test('should handle single character names', () => {
        expect(parseDisplayNameFormat('D, J (C)', true)).toBe('J D');
      });

      test('should handle names with hyphens', () => {
        expect(parseDisplayNameFormat('Smith-Johnson, Mary-Kate (Company)', true)).toBe('Mary-Kate Smith-Johnson');
      });

      test('should handle names with apostrophes', () => {
        expect(parseDisplayNameFormat("O'Brien, Patrick (Company)", true)).toBe("Patrick O'Brien");
      });
    });
  });
});
