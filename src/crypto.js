// AES-GCM encryption using Web Crypto API (browser built-in, no dependencies)

async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSettings(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKey(password, salt);
  const enc  = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(data));

  // Layout: [salt 16B][iv 12B][ciphertext]
  const combined = new Uint8Array(16 + 12 + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, 16);
  combined.set(new Uint8Array(encrypted), 28);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptSettings(base64, password) {
  const combined  = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const salt      = combined.slice(0, 16);
  const iv        = combined.slice(16, 28);
  const encrypted = combined.slice(28);
  const key       = await deriveKey(password, salt);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, encrypted);
  return new TextDecoder().decode(decrypted);
}
