// Simple in‑memory mock for Chrome extension APIs used by the extension
const storageDataLocal = {};
const storageDataSync = {};

const chrome = {
  storage: {
    local: {
      get: (keys, callback) => {
        if (typeof callback !== 'function') {
           return Promise.resolve(typeof keys === 'string' ? { [keys]: storageDataLocal[keys] } : (Array.isArray(keys) ? Object.fromEntries(keys.map(k => [k, storageDataLocal[k]])) : {...storageDataLocal}));
        }
        if (typeof keys === 'string') callback({ [keys]: storageDataLocal[keys] });
        else if (Array.isArray(keys)) callback(Object.fromEntries(keys.map(k => [k, storageDataLocal[k]])));
        else callback({ ...storageDataLocal });
      },
      set: (items, callback) => {
        Object.assign(storageDataLocal, items);
        if (typeof callback === 'function') callback();
        return Promise.resolve();
      }
    },
    sync: {
      get: (keys, callback) => {
        if (typeof callback !== 'function') {
           return Promise.resolve(typeof keys === 'string' ? { [keys]: storageDataSync[keys] } : (Array.isArray(keys) ? Object.fromEntries(keys.map(k => [k, storageDataSync[k]])) : {...storageDataSync}));
        }
        if (typeof keys === 'string') callback({ [keys]: storageDataSync[keys] });
        else if (Array.isArray(keys)) callback(Object.fromEntries(keys.map(k => [k, storageDataSync[k]])));
        else callback({ ...storageDataSync });
      },
      set: (items, callback) => {
        Object.assign(storageDataSync, items);
        if (typeof callback === 'function') callback();
        return Promise.resolve();
      }
    },
    onChanged: {
      listeners: [],
      addListener: function(fn) { this.listeners.push(fn); },
      trigger: function(changes, areaName) { this.listeners.forEach(fn => fn(changes, areaName)); },
      clear: function() { this.listeners = []; }
    }
  },
  runtime: {
    getURL: jest.fn(path => `chrome-extension://mocked-id/${path}`),
    sendMessage: jest.fn(() => Promise.resolve({ success: true })),
    onMessage: {
      listeners: [],
      addListener: function(fn) { this.listeners.push(fn); },
      trigger: function(...args) { return Promise.all(this.listeners.map(fn => fn(...args))); },
      clear: function() { this.listeners = []; }
    },
    onInstalled: {
      listeners: [],
      addListener: function(fn) { this.listeners.push(fn); },
      trigger: function(...args) { this.listeners.forEach(fn => fn(...args)); },
      clear: function() { this.listeners = []; }
    },
    getContexts: jest.fn(() => Promise.resolve([]))
  },
  offscreen: {
    createDocument: jest.fn(() => Promise.resolve()),
    closeDocument: jest.fn(() => Promise.resolve()),
    hasDocument: jest.fn(() => Promise.resolve(false))
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    onAlarm: {
      listeners: [],
      addListener: function(fn) { this.listeners.push(fn); },
      trigger: function(...args) { this.listeners.forEach(fn => fn(...args)); },
      clear: function() { this.listeners = []; }
    }
  },
  windows: {
    get: jest.fn(() => Promise.resolve({ tabs: [{ id: 1 }] })),
    create: jest.fn(() => Promise.resolve({ id: 2, tabs: [{ id: 1 }] })),
    update: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve())
  },
  tabs: {
    remove: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    sendMessage: jest.fn(() => Promise.resolve({ success: true }))
  },
  i18n: {
    getMessage: jest.fn((key) => `mocked_translation_for_${key}`)
  }
};

module.exports = chrome;
