const DB_NAME = "ai-discussion-history";
const DB_VERSION = 1;
const STORE_NAME = "discussions";
const MAX_HISTORY = 50;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function validateMessage(m) {
  if (typeof m !== "object" || m === null) return null;
  return {
    modelId: typeof m.modelId === "string" ? m.modelId : "unknown",
    text: typeof m.text === "string" ? m.text.slice(0, 50000) : "",
    error: typeof m.error === "string" ? m.error : null,
    loading: false,
  };
}

function validateRound(round) {
  if (typeof round !== "object" || round === null) return null;
  return {
    messages: Array.isArray(round.messages)
      ? round.messages.map(validateMessage).filter(Boolean)
      : [],
    userIntervention: typeof round.userIntervention === "string"
      ? round.userIntervention.slice(0, 1000)
      : "",
  };
}

function validateDiscussion(data) {
  if (typeof data !== "object" || data === null) return null;
  if (typeof data.topic !== "string" || !data.topic.trim()) return null;
  if (!Array.isArray(data.discussion)) return null;
  const validDiscussion = data.discussion.map(validateRound).filter(Boolean);
  return {
    id: typeof data.id === "string" ? data.id : crypto.randomUUID(),
    topic: data.topic.slice(0, 2000),
    discussion: validDiscussion,
    summaries: Array.isArray(data.summaries) ? data.summaries : [],
    mode: typeof data.mode === "string" ? data.mode : "best",
    discussionMode: typeof data.discussionMode === "string" ? data.discussionMode : "standard",
    personas: data.personas && typeof data.personas === "object"
      ? { claude: typeof data.personas.claude === "string" ? data.personas.claude : "", chatgpt: typeof data.personas.chatgpt === "string" ? data.personas.chatgpt : "", gemini: typeof data.personas.gemini === "string" ? data.personas.gemini : "" }
      : { claude: "", chatgpt: "", gemini: "" },
    createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
    roundCount: validDiscussion.length,
  };
}

export async function saveDiscussion(topic, discussion, summaries, mode, discussionMode, personas, existingId) {
  const db = await openDB();
  const id = existingId || crypto.randomUUID();

  let createdAt = new Date().toISOString();
  if (existingId) {
    const existing = await new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(existingId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (existing?.createdAt) createdAt = existing.createdAt;
  }

  const entry = validateDiscussion({
    id,
    topic,
    discussion,
    summaries,
    mode,
    discussionMode,
    personas,
    createdAt,
  });
  if (!entry) throw new Error("Invalid discussion data");

  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.put(entry);

  // Enforce max history limit
  const countReq = store.count();
  countReq.onsuccess = () => {
    if (countReq.result > MAX_HISTORY) {
      const idx = store.index("createdAt");
      const cursor = idx.openCursor();
      let toDelete = countReq.result - MAX_HISTORY;
      cursor.onsuccess = () => {
        if (cursor.result && toDelete > 0) {
          cursor.result.delete();
          toDelete--;
          cursor.result.continue();
        }
      };
    }
  };

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(entry.id);
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadHistory() {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const idx = store.index("createdAt");

  return new Promise((resolve, reject) => {
    const req = idx.getAll();
    req.onsuccess = () => {
      const results = (req.result || [])
        .map(validateDiscussion)
        .filter(Boolean)
        .reverse();
      resolve(results);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function loadDiscussion(id) {
  if (typeof id !== "string") return null;
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);

  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(validateDiscussion(req.result));
    req.onerror = () => reject(req.error);
  });
}

export async function deleteDiscussion(id) {
  if (typeof id !== "string") return;
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(id);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
