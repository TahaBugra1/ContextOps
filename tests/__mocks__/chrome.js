// Simple in‑memory mock for Chrome extension APIs used by the extension
const storageData = {};

const chrome = {
  storage: {
    local: {
      get: (keys, callback) => {
        if (typeof keys === 'string') {
          callback({ [keys]: storageData[keys] });
        } else if (Array.isArray(keys)) {
          const result = {};
          keys.forEach(k => (result[k] = storageData[k]));
          callback(result);
        } else {
          callback({ ...storageData });
        }
      },
      set: (items, callback) => {
        Object.assign(storageData, items);
        if (typeof callback === 'function') callback();
      }
    }
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  }
};

module.exports = chrome;
