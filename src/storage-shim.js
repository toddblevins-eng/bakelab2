// storage-shim.js
// -----------------------------------------------------------------------------
// In the Claude artifact sandbox, BakeLab persisted through a global
// `window.storage` object with an async get/set API. This shim re-creates that
// exact interface on top of the browser's localStorage so the app component
// runs unchanged outside the sandbox.
//
// Contract the component relies on:
//   await window.storage.set(key, stringValue)      -> Promise<void>
//   await window.storage.get(key)                   -> Promise<{ value } | null>
// We also provide delete() and list() for completeness/future use.
// -----------------------------------------------------------------------------

const PREFIX = "bakelab:"; // namespaces our keys so they never collide with other apps on the same origin

function safeGet(key) {
  try { return localStorage.getItem(PREFIX + key); } catch (e) { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(PREFIX + key, value); return true; }
  catch (e) {
    // QuotaExceededError or Safari private-mode write failure
    console.warn("[BakeLab] storage write failed:", e && e.name);
    return false;
  }
}

const shim = {
  async get(key) {
    const v = safeGet(key);
    return v == null ? null : { key, value: v };
  },
  async set(key, value) {
    const ok = safeSet(key, typeof value === "string" ? value : JSON.stringify(value));
    return { key, ok };
  },
  async delete(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) {}
    return { key, deleted: true };
  },
  async list(prefix = "") {
    const keys = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) {
          const bare = k.slice(PREFIX.length);
          if (bare.startsWith(prefix)) keys.push(bare);
        }
      }
    } catch (e) {}
    return { keys };
  },
};

// Only install if something hasn't already provided window.storage.
if (typeof window !== "undefined" && !window.storage) {
  window.storage = shim;
}

export default shim;
