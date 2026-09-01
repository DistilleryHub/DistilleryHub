/**
 * Firestore Security Rules — automated tests.
 *
 * These run against the LOCAL Firebase Emulator, never against your real
 * production database, so they're safe to run as often as you like.
 *
 * HOW TO RUN:
 *   1. From the project root: npm install --prefix tests
 *   2. firebase emulators:exec --only firestore "node tests/firestore.rules.test.js"
 *
 * IMPORTANT — this file was written but never executed by the assistant
 * (no Firebase Emulator was available in that sandboxed environment). Run
 * it yourself and fix anything that fails before trusting it in CI.
 *
 * Coverage: this is a starting set of the highest-risk rules (impersonation,
 * cross-account access, admin escalation, chat/call privacy) — not
 * exhaustive. Add a test here any time you change firestore.rules.
 */
const test = require("node:test");
const assert = require("node:assert");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const fs = require("node:fs");
const path = require("node:path");

let testEnv;

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "distilleryhub-test",
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "..", "firebase", "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080
    }
  });
});

test.after(async () => {
  await testEnv.cleanup();
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ---------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------
test("a user can create their own profile as unverified/non-admin", async () => {
  const alice = testEnv.authenticatedContext("alice").firestore();
  await assertSucceeds(alice.collection("users").doc("alice").set({
    name: "Alice", isAdmin: false, isBanned: false, isVerified: false
  }));
});

test("a user CANNOT self-verify or self-grant admin on create", async () => {
  const alice = testEnv.authenticatedContext("alice").firestore();
  await assertFails(alice.collection("users").doc("alice").set({
    name: "Alice", isAdmin: true, isBanned: false, isVerified: false
  }));
  await assertFails(alice.collection("users").doc("alice").set({
    name: "Alice", isAdmin: false, isBanned: false, isVerified: true
  }));
});

test("a user CANNOT edit someone else's profile", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("bob").set({ name: "Bob", isAdmin: false, isBanned: false, isVerified: false });
  });
  const alice = testEnv.authenticatedContext("alice").firestore();
  await assertFails(alice.collection("users").doc("bob").update({ name: "Hacked" }));
});

test("an admin CAN verify another member", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("admin1").set({ name: "Admin", isAdmin: true, isBanned: false, isVerified: false });
    await ctx.firestore().collection("users").doc("bob").set({ name: "Bob", isAdmin: false, isBanned: false, isVerified: false });
  });
  const admin1 = testEnv.authenticatedContext("admin1").firestore();
  await assertSucceeds(admin1.collection("users").doc("bob").update({ isVerified: true }));
});

// ---------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------
test("a user cannot create a post pretending to be someone else", async () => {
  const alice = testEnv.authenticatedContext("alice").firestore();
  await assertFails(alice.collection("posts").add({
    authorUid: "bob", text: "not mine", createdAt: new Date()
  }));
});

test("only the author (or a moderator) can delete a post", async () => {
  let postRef;
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    postRef = await ctx.firestore().collection("posts").add({ authorUid: "alice", text: "hi" });
  });
  const bob = testEnv.authenticatedContext("bob").firestore();
  await assertFails(bob.collection("posts").doc(postRef.id).delete());

  const alice = testEnv.authenticatedContext("alice").firestore();
  await assertSucceeds(alice.collection("posts").doc(postRef.id).delete());
});

// ---------------------------------------------------------------------
// Conversations / messages (privacy is the highest-risk area here)
// ---------------------------------------------------------------------
test("a non-member cannot read a 1-1 conversation", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("conversations").doc("alice_bob").set({
      memberIds: ["alice", "bob"]
    });
  });
  const eve = testEnv.authenticatedContext("eve").firestore();
  await assertFails(eve.collection("conversations").doc("alice_bob").get());

  const alice = testEnv.authenticatedContext("alice").firestore();
  await assertSucceeds(alice.collection("conversations").doc("alice_bob").get());
});

test("a non-member cannot send a message into someone else's conversation", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("conversations").doc("alice_bob").set({
      memberIds: ["alice", "bob"]
    });
  });
  const eve = testEnv.authenticatedContext("eve").firestore();
  await assertFails(eve.collection("conversations").doc("alice_bob").collection("messages").add({
    senderUid: "eve", text: "sneaky", createdAt: new Date(), messageType: "text"
  }));
});

// ---------------------------------------------------------------------
// Calls (1-1 signaling privacy)
// ---------------------------------------------------------------------
test("only the two call participants can read a call's signaling doc", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("calls").doc("call1").set({
      callerUid: "alice", calleeUid: "bob", type: "audio", status: "ringing"
    });
  });
  const eve = testEnv.authenticatedContext("eve").firestore();
  await assertFails(eve.collection("calls").doc("call1").get());

  const bob = testEnv.authenticatedContext("bob").firestore();
  await assertSucceeds(bob.collection("calls").doc("call1").get());
});

console.log("\nRun with: firebase emulators:exec --only firestore \"node tests/firestore.rules.test.js\"\n");
