// functions/_lib/firebaseAdmin.js
//
// Files/folders starting with "_" are ignored by Cloudflare Pages' file-based
// router, so this is safe to import from route files without it becoming
// its own API endpoint.
//
// Replaces `firebase-admin` for the pieces this app actually uses:
//   - verifying a client's Firebase ID token (was: admin.auth() via context.auth)
//   - getting a Google OAuth access token to call Firestore's REST API
//     (was: admin.firestore(), automatic under the hood)
//   - minting a Firebase custom token (was: admin.auth().createCustomToken)
//
// Needs these three Cloudflare Pages environment variables/secrets, taken
// from your Firebase service account JSON (Firebase Console → Project
// Settings → Service Accounts → Generate new private key):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY   (paste the PEM as-is; this file handles the \n)

import { SignJWT, importPKCS8, jwtVerify, createRemoteJWKSet } from 'jose';

// Google publishes Firebase ID token verification keys in JWK format here.
const ID_TOKEN_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

/** Verifies a Firebase Auth ID token. Returns the decoded payload (payload.sub is the uid). */
export async function verifyIdToken(idToken, env) {
  const { payload } = await jwtVerify(idToken, ID_TOKEN_JWKS, {
    issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
    audience: env.FIREBASE_PROJECT_ID,
  });
  return payload;
}

/** Reads the Authorization: Bearer <idToken> header and verifies it. Returns { uid, email, admin } or null.
 * `admin` mirrors the ID token's custom claim (set via setCustomClaims below) — Firebase Auth
 * automatically embeds custom claims into every ID token it issues, same as with the Admin SDK. */
export async function requireAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const idToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!idToken) return null;
  try {
    const payload = await verifyIdToken(idToken, env);
    return { uid: payload.sub, email: payload.email, admin: payload.admin === true };
  } catch {
    return null;
  }
}

async function getPrivateKey(env) {
  const pem = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  return importPKCS8(pem, 'RS256');
}

// One token covers every REST API this app calls (Firestore + FCM push +
// Identity Toolkit for auth/claims) — simpler than minting a separate token
// per scope, and Google allows multiple space-separated scopes in one JWT.
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/firebase.messaging',
  'https://www.googleapis.com/auth/identitytoolkit',
  'https://www.googleapis.com/auth/cloud-platform',
].join(' ');

/** Google OAuth2 access token (service account) for calling Firestore/FCM/Identity Toolkit REST APIs. */
export async function getAccessToken(env, scope = DEFAULT_SCOPES) {
  const key = await getPrivateKey(env);
  const jwt = await new SignJWT({ scope })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setIssuer(env.FIREBASE_CLIENT_EMAIL)
    .setSubject(env.FIREBASE_CLIENT_EMAIL)
    .setAudience('https://oauth2.googleapis.com/token')
    .setExpirationTime('1h')
    .sign(key);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error('Google OAuth token fetch failed: ' + (await res.text()));
  const data = await res.json();
  return data.access_token;
}

/** Equivalent of admin.auth().createCustomToken(uid) — client exchanges this via signInWithCustomToken. */
export async function createCustomToken(env, uid) {
  const key = await getPrivateKey(env);
  return new SignJWT({ uid })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setIssuer(env.FIREBASE_CLIENT_EMAIL)
    .setSubject(env.FIREBASE_CLIENT_EMAIL)
    .setAudience(
      'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit'
    )
    .setExpirationTime('1h')
    .sign(key);
}

/** Equivalent of admin.auth().getUser(uid) — just the fields deleteAccount.js needs. */
export async function getAuthUser(env, accessToken, uid) {
  const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: [uid] }),
  });
  if (!res.ok) throw new Error('Auth lookup failed: ' + (await res.text()));
  const data = await res.json();
  const user = (data.users || [])[0];
  return user ? { uid: user.localId, email: user.email } : null;
}

/** Equivalent of admin.auth().getUser(uid).customClaims — reads current custom claims. */
export async function getUserClaims(env, accessToken, uid) {
  const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: [uid] }),
  });
  if (!res.ok) throw new Error('Auth lookup failed: ' + (await res.text()));
  const data = await res.json();
  const user = (data.users || [])[0];
  if (!user) return null;
  return user.customAttributes ? JSON.parse(user.customAttributes) : {};
}

/** Equivalent of admin.auth().setCustomUserClaims(uid, claims). */
export async function setCustomClaims(env, accessToken, uid, claims) {
  const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:update', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid, customAttributes: JSON.stringify(claims) }),
  });
  if (!res.ok) throw new Error('Set custom claims failed: ' + (await res.text()));
}

/** Equivalent of admin.auth().deleteUser(uid). */
export async function deleteAuthUser(env, accessToken, uid) {
  const res = await fetch('https://identitytoolkit.googleapis.com/v1/accounts:delete', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId: uid }),
  });
  if (!res.ok && res.status !== 404) throw new Error('Auth delete failed: ' + (await res.text()));
}

// ---------------- Firestore REST client (minimal) ----------------

function fsValueToJs(v) {
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return new Date(v.timestampValue);
  if (v.nullValue !== undefined) return null;
  if (v.mapValue !== undefined) return fsDocToJs({ fields: v.mapValue.fields || {} });
  if (v.arrayValue !== undefined) return (v.arrayValue.values || []).map(fsValueToJs);
  return undefined;
}

function fsDocToJs(doc) {
  const out = {};
  const fields = doc.fields || {};
  for (const k in fields) out[k] = fsValueToJs(fields[k]);
  return out;
}

function jsToFsValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'boolean') return { booleanValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  return { stringValue: String(val) };
}

function jsToFsFields(obj) {
  const fields = {};
  for (const k in obj) fields[k] = jsToFsValue(obj[k]);
  return fields;
}

const FIRESTORE_BASE = (projectId) =>
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

export async function fsGetDoc(env, accessToken, collection, docId) {
  const res = await fetch(`${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}/${collection}/${docId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Firestore get failed: ' + (await res.text()));
  return fsDocToJs(await res.json());
}

export async function fsQueryByField(env, accessToken, collection, field, op, value, limit = 1) {
  const res = await fetch(`${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op, value: { stringValue: value } } },
        limit,
      },
    }),
  });
  if (!res.ok) throw new Error('Firestore query failed: ' + (await res.text()));
  const rows = await res.json();
  const hit = rows.find((r) => r.document);
  if (!hit) return null;
  return { id: hit.document.name.split('/').pop(), data: fsDocToJs(hit.document) };
}

/** Query a collection by a boolean field (used for deletionRequested == true). */
export async function fsQueryByBoolField(env, accessToken, collection, field, value) {
  const res = await fetch(`${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { booleanValue: value } } },
      },
    }),
  });
  if (!res.ok) throw new Error('Firestore query failed: ' + (await res.text()));
  const rows = await res.json();
  return rows
    .filter((r) => r.document)
    .map((r) => ({ id: r.document.name.split('/').pop(), data: fsDocToJs(r.document) }));
}

/** Merge-writes fields onto a doc (creates it if missing) — matches `.set(data, { merge: true })`. */
export async function fsMergeDoc(env, accessToken, collection, docId, data) {
  const mask = Object.keys(data)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join('&');
  const res = await fetch(`${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}/${collection}/${docId}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: jsToFsFields(data) }),
  });
  if (!res.ok) throw new Error('Firestore merge failed: ' + (await res.text()));
}

/** Deletes one field from a doc without touching the rest — matches admin.firestore.FieldValue.delete(). */
export async function fsDeleteField(env, accessToken, collection, docId, fieldName) {
  const res = await fetch(
    `${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}/${collection}/${docId}?updateMask.fieldPaths=${encodeURIComponent(fieldName)}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {} }),
    }
  );
  if (!res.ok) throw new Error('Firestore field delete failed: ' + (await res.text()));
}

export async function fsDeleteDoc(env, accessToken, collection, docId) {
  const res = await fetch(`${FIRESTORE_BASE(env.FIREBASE_PROJECT_ID)}/${collection}/${docId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) throw new Error('Firestore delete failed: ' + (await res.text()));
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** SHA-1 hex digest via Web Crypto — used by cloudinarySign.js instead of Node's crypto.createHash. */
export async function sha1Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Cryptographically random hex token — used by deleteAccount.js instead of Node's crypto.randomBytes. */
export function randomHex(byteLength) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------- FCM HTTP v1 (replaces admin.messaging()) ----------------

/**
 * Sends one push message to one FCM registration token via the HTTP v1 API.
 * Returns true on success. On failure (expired/invalid token, etc.) it
 * returns false instead of throwing, so one bad token in a user's
 * `fcmTokens` array never blocks the others.
 */
async function sendPushToOneToken(env, accessToken, fcmToken, { title, body, link }) {
  const APP_URL = env.APP_URL || 'https://distilleryhub.github.io/DistilleryHub';
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            notification: { title, body },
            webpush: {
              fcm_options: { link: link || `${APP_URL}/` },
              notification: { icon: `${APP_URL}/icon-192.png` },
            },
          },
        }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Sends the same push to every token in `fcmTokens` (a user can have multiple devices). */
export async function sendPushToTokens(env, accessToken, fcmTokens, { title, body, link }) {
  const tokens = (fcmTokens || []).filter(Boolean);
  const results = await Promise.all(
    tokens.map((t) => sendPushToOneToken(env, accessToken, t, { title, body, link }))
  );
  return results.filter(Boolean).length; // how many succeeded
}
