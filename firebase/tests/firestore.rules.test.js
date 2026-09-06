/**
 * PRODUCTION: automated tests for firebase/firestore.rules, run against the
 * local Firestore emulator (never against your real project — this never
 * touches production data).
 *
 * Setup (one time):
 *   cd firebase/tests
 *   npm install
 *
 * Run:
 *   npm test
 *
 * This covers the highest-risk permission boundaries — it is NOT
 * exhaustive. Add a case here any time you change firestore.rules.
 */
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require("@firebase/rules-unit-testing");
const fs = require("fs");
const path = require("path");
const { setDoc, doc, updateDoc, deleteDoc, getDoc, addDoc, collection } = require("firebase/firestore");

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-distilleryhub",
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8")
    }
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

function asUser(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}
function asAnon() {
  return testEnv.unauthenticatedContext().firestore();
}
async function seed(setupFn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => setupFn(ctx.firestore()));
}

describe("users", () => {
  it("lets a user create their own profile", async () => {
    const db = asUser("alice");
    await assertSucceeds(setDoc(doc(db, "users/alice"), { name: "Alice", blocked: [], isAdmin: false }));
  });

  it("blocks creating someone else's profile", async () => {
    const db = asUser("alice");
    await assertFails(setDoc(doc(db, "users/bob"), { name: "Not Alice" }));
  });

  it("lets a user edit their own profile but not someone else's", async () => {
    await seed((db) => setDoc(doc(db, "users/bob"), { name: "Bob", isAdmin: false }));
    await assertSucceeds(updateDoc(doc(asUser("bob"), "users/bob"), { headline: "Distiller" }));
    await assertFails(updateDoc(doc(asUser("alice"), "users/bob"), { headline: "Hacked" }));
  });

  it("keeps a user's saved-items subcollection private", async () => {
    await seed((db) => setDoc(doc(db, "users/bob"), { name: "Bob", isAdmin: false }));
    await assertSucceeds(setDoc(doc(asUser("bob"), "users/bob/saved/job_1"), { type: "job", refId: "1" }));
    await assertFails(getDoc(doc(asUser("alice"), "users/bob/saved/job_1")));
  });
});

describe("posts", () => {
  it("lets an author create their own post but not one attributed to someone else", async () => {
    const db = asUser("alice");
    await assertSucceeds(addDoc(collection(db, "posts"), { authorUid: "alice", text: "hi", likes: [] }));
    await assertFails(addDoc(collection(db, "posts"), { authorUid: "bob", text: "spoofed", likes: [] }));
  });

  it("lets anyone toggle only the likes field, but not edit the text", async () => {
    let postId;
    await seed(async (db) => {
      const ref = await addDoc(collection(db, "posts"), { authorUid: "alice", text: "hi", likes: [] });
      postId = ref.id;
    });
    await assertSucceeds(updateDoc(doc(asUser("bob"), "posts", postId), { likes: ["bob"] }));
    await assertFails(updateDoc(doc(asUser("bob"), "posts", postId), { text: "hacked" }));
  });
});

describe("conversations & messages", () => {
  it("only lets conversation members read the conversation", async () => {
    await seed((db) => setDoc(doc(db, "conversations/c1"), { memberIds: ["alice", "bob"] }));
    await assertSucceeds(getDoc(doc(asUser("alice"), "conversations/c1")));
    await assertFails(getDoc(doc(asUser("mallory"), "conversations/c1")));
  });

  it("only lets a real member send a message, as themself", async () => {
    await seed((db) => setDoc(doc(db, "conversations/c1"), { memberIds: ["alice", "bob"] }));
    await assertSucceeds(addDoc(collection(asUser("alice"), "conversations/c1/messages"), { senderUid: "alice", text: "hi" }));
    await assertFails(addDoc(collection(asUser("mallory"), "conversations/c1/messages"), { senderUid: "mallory", text: "hi" }));
    await assertFails(addDoc(collection(asUser("alice"), "conversations/c1/messages"), { senderUid: "bob", text: "spoofed" }));
  });

  it("lets any member star/react without touching the sender's text", async () => {
    let msgId;
    await seed(async (db) => {
      await setDoc(doc(db, "conversations/c1"), { memberIds: ["alice", "bob"] });
      const ref = await addDoc(collection(db, "conversations/c1/messages"), { senderUid: "alice", text: "hi" });
      msgId = ref.id;
    });
    await assertSucceeds(updateDoc(doc(asUser("bob"), "conversations/c1/messages", msgId), { starredBy: ["bob"] }));
    await assertFails(updateDoc(doc(asUser("bob"), "conversations/c1/messages", msgId), { text: "hacked" }));
  });
});

describe("job applications", () => {
  it("lets an applicant apply as themself, and only the poster can list applicants", async () => {
    await seed((db) => setDoc(doc(db, "jobs/j1"), { postedByUid: "alice", title: "Distiller" }));
    await assertSucceeds(setDoc(doc(asUser("bob"), "jobs/j1/applicants/bob"), { applicantUid: "bob", name: "Bob" }));
    await assertSucceeds(getDoc(doc(asUser("alice"), "jobs/j1/applicants/bob"))); // poster
    await assertSucceeds(getDoc(doc(asUser("bob"), "jobs/j1/applicants/bob")));   // applicant themself
    await assertFails(getDoc(doc(asUser("mallory"), "jobs/j1/applicants/bob")));  // random member
  });
});

describe("rate limit counters", () => {
  it("is completely off-limits to every client", async () => {
    await assertFails(setDoc(doc(asUser("alice"), "rateLimits/alice_posts"), { count: 999 }));
    await assertFails(getDoc(doc(asUser("alice"), "rateLimits/alice_posts")));
  });
});
