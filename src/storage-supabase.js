// storage-supabase.js
// -----------------------------------------------------------------------------
// Installs window.storage backed by Supabase (durable, cross-device) with a
// localStorage cache layered in front for instant reads and offline use.
//
// Same async contract the BakeLab component expects:
//   window.storage.get(key)  -> { value } | null
//   window.storage.set(key, stringValue)
//   window.storage.delete(key) / window.storage.list(prefix)
//
// Behaviours:
//  - Reads come from Supabase when online (so other devices' changes show up),
//    falling back to the local cache when offline.
//  - The FIRST signed-in load auto-migrates any Tier-1 localStorage data up to
//    the cloud (so nothing you already entered is lost).
//  - Writes hit the local cache immediately, then upsert to Supabase. If the
//    upsert fails (offline), the key is queued and flushed on reconnect / reload.
// -----------------------------------------------------------------------------

const CACHE_PREFIX = "bakelab:";        // local cache namespace (same as Tier 1, so existing data is found)
const DIRTY_KEY = "bakelab:_dirty";     // list of keys written locally but not yet confirmed in the cloud
const TABLE = "kv";

function lget(key) { try { return localStorage.getItem(CACHE_PREFIX + key); } catch { return null; } }
function lset(key, value) { try { localStorage.setItem(CACHE_PREFIX + key, value); } catch {} }
function ldel(key) { try { localStorage.removeItem(CACHE_PREFIX + key); } catch {} }

function readDirty() { try { return JSON.parse(localStorage.getItem(DIRTY_KEY) || "[]"); } catch { return []; } }
function writeDirty(arr) { try { localStorage.setItem(DIRTY_KEY, JSON.stringify([...new Set(arr)])); } catch {} }
function markDirty(key) { writeDirty([...readDirty(), key]); }
function unmarkDirty(key) { writeDirty(readDirty().filter((k) => k !== key)); }

export function installSupabaseStorage(supabase, userId) {
  const online = () => (typeof navigator === "undefined" ? true : navigator.onLine);

  async function cloudGet(key) {
    const { data, error } = await supabase.from(TABLE).select("value").eq("user_id", userId).eq("key", key).maybeSingle();
    if (error) throw error;
    return data ? data.value : null;
  }
  async function cloudSet(key, value) {
    const { error } = await supabase.from(TABLE).upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) throw error;
  }
  async function cloudDelete(key) {
    const { error } = await supabase.from(TABLE).delete().eq("user_id", userId).eq("key", key);
    if (error) throw error;
  }

  async function flushDirty() {
    if (!online()) return;
    for (const key of readDirty()) {
      const v = lget(key);
      if (v == null) { unmarkDirty(key); continue; }
      try { await cloudSet(key, v); unmarkDirty(key); } catch { /* stay dirty, try again later */ }
    }
  }

  const storage = {
    async get(key) {
      if (online()) {
        try {
          const cloud = await cloudGet(key);
          if (cloud != null) { lset(key, cloud); return { key, value: cloud }; }
          // not in cloud yet — migrate any existing local (Tier 1) value upward
          const local = lget(key);
          if (local != null) { markDirty(key); flushDirty(); return { key, value: local }; }
          return null;
        } catch {
          const local = lget(key);
          return local == null ? null : { key, value: local };
        }
      }
      const local = lget(key);
      return local == null ? null : { key, value: local };
    },
    async set(key, value) {
      const v = typeof value === "string" ? value : JSON.stringify(value);
      lset(key, v);            // instant + offline-safe
      markDirty(key);
      if (online()) { try { await cloudSet(key, v); unmarkDirty(key); } catch {} }
      return { key, ok: true };
    },
    async delete(key) {
      ldel(key); unmarkDirty(key);
      if (online()) { try { await cloudDelete(key); } catch {} }
      return { key, deleted: true };
    },
    async list(prefix = "") {
      const set = new Set();
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(CACHE_PREFIX)) { const bare = k.slice(CACHE_PREFIX.length); if (bare !== "_dirty" && bare.startsWith(prefix)) set.add(bare); }
        }
      } catch {}
      if (online()) {
        try {
          const { data } = await supabase.from(TABLE).select("key").eq("user_id", userId).like("key", prefix + "%");
          (data || []).forEach((r) => set.add(r.key));
        } catch {}
      }
      return { keys: [...set] };
    },
  };

  if (typeof window !== "undefined") {
    window.storage = storage;
    window.addEventListener("online", flushDirty);
  }
  // push any queued offline writes now (and migrate Tier-1 data on first run)
  flushDirty();
  return storage;
}
