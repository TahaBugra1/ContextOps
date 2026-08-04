// Jest setup file to mock Chrome extension APIs
// This file is referenced in package.json > jest > setupFiles
// It loads the in‑memory mock defined in tests/__mocks__/chrome.js
global.chrome = require('./__mocks__/chrome');

// Mock global fetch for mainWorld initialization
if (typeof window !== 'undefined') {
  window.fetch = jest.fn(() => Promise.resolve({ json: () => ({}) }));
} else {
  global.fetch = jest.fn(() => Promise.resolve({ json: () => ({}) }));
}
