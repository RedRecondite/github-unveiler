// background.js

const CACHE_KEY = "githubDisplayNameCache";
let nameLocks = {};  // key: origin+username, value: true if a fetch is in progress
let cacheLock = Promise.resolve();

// --- Browser Action & Content Script Injection ---

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url) {
    console.error("No URL found for the active tab.");
    return;
  }

  let url;
  try {
    url = new URL(tab.url);
  } catch (e) {
    console.error("Invalid URL:", tab.url);
    return;
  }

  const originPattern = `${url.protocol}//${url.hostname}/*`;
  console.log("Requesting permission for", originPattern);

  // Request permission as part of a user gesture.
  chrome.permissions.request({ origins: [originPattern] }, (granted) => {
    if (granted) {
      console.log("Permission granted for", originPattern);
      injectContentScript(tab.id);
    } else {
      console.log("Permission denied for", originPattern);
    }
  });
});

// Listen for tab updates to auto-inject the content script when permission is already granted.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only proceed when the tab is fully loaded.
  if (changeInfo.status === "complete" && tab.url) {
    let url;
    try {
      url = new URL(tab.url);
    } catch (e) {
      return;
    }

    const originPattern = `${url.protocol}//${url.hostname}/*`;
    chrome.permissions.contains({ origins: [originPattern] }, (hasPermission) => {
      if (hasPermission) {
        console.log("Auto injecting content script for", originPattern);
        injectContentScript(tabId);
      } else {
        console.log("No permission for", originPattern, "; content script not injected.");
      }
    });
  }
});

function injectContentScript(tabId) {
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ["content.js"]
  }, () => {
    if (chrome.runtime.lastError) {
      console.error("Script injection failed:", chrome.runtime.lastError);
    } else {
      console.log("Content script injected into tab", tabId);
    }
  });
}

// --- Lock Manager & Cache Update ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "acquireLock") {
    // Only one fetch per origin+username
    const key = message.origin + message.username;
    if (!nameLocks[key]) {
      nameLocks[key] = true;
      sendResponse({ acquired: true });
    } else {
      sendResponse({ acquired: false });
    }
  } else if (message.type === "releaseLock") {
    updateCache(message.origin, message.username, message.displayName)
      .then(() => {
        const key = message.origin + message.username;
        delete nameLocks[key];
        sendResponse({ success: true });
      })
      .catch((err) => {
        console.error("Error updating cache:", err);
        sendResponse({ success: false, error: err.toString() });
      });
    // Indicate that we'll send a response asynchronously.
    return true;
  }
});

// Helper: Get the cache from chrome.storage.local.
function getCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CACHE_KEY], (result) => {
      resolve(result[CACHE_KEY] || {});
    });
  });
}

// Helper: Update the cache in chrome.storage.local.
function setCache(cache) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CACHE_KEY]: cache }, () => {
      resolve();
    });
  });
}

async function updateCache(origin, username, displayName) {
  cacheLock = cacheLock.then(async () => {
    const cache = await getCache();
    const serverCache = cache[origin] || {};
    serverCache[username] = { displayName, timestamp: Date.now() };
    cache[origin] = serverCache;
    await setCache(cache);
  }).catch((err) => {
    console.error("Error updating cache:", err);
  });
  return cacheLock;
}
