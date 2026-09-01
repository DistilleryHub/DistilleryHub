/**
 * DistilleryHub — Cloud Functions
 *
 * 1. sendNotificationPush — fires whenever a /notifications/{id} doc is
 *    created (likes, comments, connection requests, messages) and pushes
 *    a real device notification via Firebase Cloud Messaging.
 *
 * 2. renderJob / renderArticle — server-rendered, crawlable HTML for a
 *    single job or article so Google (and link-preview bots like
 *    WhatsApp/LinkedIn/Twitter) can index and preview real content,
 *    something the client-only SPA cannot provide on its own.
 *
 * 3. sitemap — dynamically generated sitemap.xml that includes every
 *    job and article, regenerated on each request from live Firestore data.
 *
 * DEPLOY: from the project root —
 *   cd functions && npm install
 *   firebase deploy --only functions,hosting,firestore:rules
 * Requires the Firebase project to be on the Blaze (pay-as-you-go) plan.
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { v1: firestoreAdminV1 } = require("@google-cloud/firestore");

admin.initializeApp();
const db = admin.firestore();
const SITE = "https://distilleryhub-b1d2d.web.app";
const firestoreAdminClient = new firestoreAdminV1.FirestoreAdminClient();

/* ---------------------------------------------------------------- */
/* 0. Scheduled Firestore backup                                     */
/*                                                                    */
/* SETUP REQUIRED (one-time, in Google Cloud Console — this can't be  */
/* provisioned from code):                                           */
/*   1. Create a Cloud Storage bucket for backups, e.g.:              */
/*        gsutil mb -l us-central1 gs://YOUR-PROJECT-ID-firestore-bak */
/*   2. Grant the Cloud Functions service account export permission:  */
/*        gcloud projects add-iam-policy-binding YOUR-PROJECT-ID \    */
/*          --member="serviceAccount:YOUR-PROJECT-ID@appspot.gserviceaccount.com" \ */
/*          --role="roles/datastore.importExportAdmin"                */
/*   3. Replace BACKUP_BUCKET below with your actual bucket name.     */
/*                                                                    */
/* SIMPLER ALTERNATIVE: Firebase Console → Firestore Database →       */
/* Backups tab → enable "Point-in-time recovery" or a scheduled       */
/* backup policy — zero code, but shorter retention window and it    */
/* only lets you restore the whole database, not browse individual   */
/* export files the way this function's exports allow.                */
/* ---------------------------------------------------------------- */
const BACKUP_BUCKET = "gs://YOUR-PROJECT-ID-firestore-backups"; // <-- set this

exports.scheduledFirestoreExport = onSchedule("every 24 hours", async () => {
  if (BACKUP_BUCKET.includes("YOUR-PROJECT-ID")) {
    console.warn("scheduledFirestoreExport: BACKUP_BUCKET not configured — skipping. See setup notes above this function.");
    return;
  }
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || admin.instanceId().app.options.projectId;
  const databaseName = firestoreAdminClient.databasePath(projectId, "(default)");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  await firestoreAdminClient.exportDocuments({
    name: databaseName,
    outputUriPrefix: `${BACKUP_BUCKET}/${timestamp}`,
    collectionIds: [] // empty = back up every collection
  });
  console.log(`Firestore export started → ${BACKUP_BUCKET}/${timestamp}`);
});

/* ---------------------------------------------------------------- */
/* 1. Push notifications                                             */
/* ---------------------------------------------------------------- */

function notificationCopy(n) {
  const name = n.fromName || "Someone";
  switch (n.type) {
    case "like": return { title: "New like", body: `${name} liked your post` };
    case "comment": return { title: "New comment", body: `${name} commented on your post` };
    case "connection_request": return { title: "Connection request", body: `${name} wants to connect` };
    case "connection_accept": return { title: "Connection accepted", body: `${name} accepted your request` };
    case "message": return { title: name, body: "Sent you a message" };
    case "call": return { title: name, body: n.callType === "video" ? "Incoming video call" : "Incoming voice call" };
    case "missed_call": return { title: "Missed call", body: `You missed a call from ${name}` };
    case "group_call": return { title: "Group call started", body: `${name} started a ${n.callType === "video" ? "video" : "voice"} call` };
    case "job_alert": return { title: "New job match", body: n.jobTitle ? `${n.jobTitle} matches your saved alert` : "A new job matches your saved alert" };
    case "mention": return { title: `${name} mentioned you`, body: n.mentionText || "You were mentioned in a chat" };
    case "group_invite": return { title: "Added to a group", body: `${name} added you to ${n.groupName || "a group"}` };
    default: return { title: "DistilleryHub", body: `${name} interacted with your activity` };
  }
}

// Maps a notification type to its Notification Settings toggle key.
// Returns null for types that are never gated (always sent).
function notificationSettingKey(type) {
  switch (type) {
    case "message": case "call": case "missed_call": return "messages";
    case "like": return "likes";
    case "comment": return "comments";
    case "connection_request": case "connection_accept": return "connections";
    case "mention": return "mentions";
    case "group_invite": return "group_invites";
    case "group_call": return "group_calls";
    default: return null;
  }
}

exports.sendNotificationPush = onDocumentCreated("notifications/{notificationId}", async (event) => {
  const n = event.data.data();
  if (!n || !n.userId) return;

  const userSnap = await db.collection("users").doc(n.userId).get();
  if (!userSnap.exists) return;
  const userData = userSnap.data();
  const tokens = userData.fcmTokens || [];
  if (!tokens.length) return;

  // Respect the user's Notification Settings toggles (in-app badge/list is
  // never affected — the notification doc already exists regardless; this
  // only controls whether we push a device notification for it).
  const settingKey = notificationSettingKey(n.type);
  if (settingKey && userData.notificationSettings && userData.notificationSettings[settingKey] === false) {
    return;
  }

  const { title, body } = notificationCopy(n);
  const chatTypes = ["message", "call", "missed_call", "group_call", "mention", "group_invite"];

  const resp = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: { icon: `${SITE}/favicon.svg` },
      fcmOptions: { link: chatTypes.includes(n.type) ? `${SITE}/?open=chat` : SITE }
    }
  });

  // clean up tokens that are no longer valid (uninstalled / expired)
  const deadTokens = [];
  resp.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error && r.error.code;
      if (code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token") {
        deadTokens.push(tokens[i]);
      }
    }
  });
  if (deadTokens.length) {
    await userSnap.ref.update({
      fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens)
    });
  }
});

/* ---------------------------------------------------------------- */
/* 1b. Job alerts — notify users whose saved keyword matches a       */
/*     newly posted job (title/company/location/description).       */
/* ---------------------------------------------------------------- */

exports.matchJobAlerts = onDocumentCreated("jobs/{jobId}", async (event) => {
  const job = event.data.data();
  if (!job) return;
  const jobId = event.params.jobId;
  const haystack = `${job.title || ""} ${job.company || ""} ${job.location || ""} ${job.description || ""}`.toLowerCase();

  const alertsSnap = await db.collection("jobAlerts").get();
  if (alertsSnap.empty) return;

  const notifiedUids = new Set();
  const writes = [];
  alertsSnap.forEach((docSnap) => {
    const alert = docSnap.data();
    if (!alert.uid || !alert.keyword) return;
    if (alert.uid === job.postedByUid) return; // don't notify the poster about their own listing
    if (notifiedUids.has(alert.uid)) return; // avoid duplicate notifications from multiple matching keywords
    if (haystack.includes(String(alert.keyword).toLowerCase())) {
      notifiedUids.add(alert.uid);
      writes.push(db.collection("notifications").add({
        userId: alert.uid,
        type: "job_alert",
        fromUid: job.postedByUid || "",
        fromName: job.postedByName || "DistilleryHub",
        fromPhoto: "",
        jobId,
        jobTitle: job.title || "",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }));
    }
  });
  await Promise.all(writes);
});

/* ---------------------------------------------------------------- */
/* Shared HTML helpers                                                */
/* ---------------------------------------------------------------- */

function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function pageShell({ title, description, canonical, image, jsonLd, bodyHtml }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<link rel="icon" href="${SITE}/favicon.svg" type="image/svg+xml">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<style>
  body{margin:0;background:#0b1420;color:#eef3f6;font-family:Arial,sans-serif;line-height:1.6;}
  .wrap{max-width:680px;margin:0 auto;padding:32px 20px 60px;}
  a.cta{display:inline-block;margin-top:22px;background:linear-gradient(155deg,#f0a559,#a5641f);color:#1a1006;
        text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px;}
  a.back{color:#8ca0b3;text-decoration:none;font-size:13px;}
  h1{font-size:26px;margin:14px 0 6px;}
  .meta{color:#8ca0b3;font-size:13px;margin-bottom:18px;}
  img.cover{width:100%;border-radius:10px;margin:14px 0;}
  .brand{font-weight:700;color:#d98b3f;font-size:14px;}
</style>
</head>
<body>
  <div class="wrap">
    <a class="back" href="${SITE}/">&larr; DistilleryHub</a>
    ${bodyHtml}
    <a class="cta" href="${SITE}/?open=${esc(canonical.split('/').slice(-2).join(':'))}">Open in the app</a>
  </div>
</body>
</html>`;
}

function idFromPath(req, prefix) {
  const m = req.path.match(new RegExp(`^/${prefix}/([^/]+)/?$`));
  return m ? decodeURIComponent(m[1]) : null;
}

/* ---------------------------------------------------------------- */
/* 2. renderJob                                                       */
/* ---------------------------------------------------------------- */

exports.renderJob = onRequest(async (req, res) => {
  const id = idFromPath(req, "jobs");
  if (!id) { res.status(404).send("Not found"); return; }
  const snap = await db.collection("jobs").doc(id).get();
  if (!snap.exists) { res.status(404).send("This job posting is no longer available."); return; }
  const j = snap.data();
  const canonical = `${SITE}/jobs/${id}`;
  const description = (j.description || "").slice(0, 300);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: j.title,
    description: j.description || j.title,
    datePosted: j.createdAt ? j.createdAt.toDate().toISOString() : undefined,
    employmentType: (j.jobType || "FULL_TIME").toUpperCase().replace(/[- ]/g, "_"),
    hiringOrganization: { "@type": "Organization", name: j.company || "DistilleryHub" },
    jobLocation: j.location ? { "@type": "Place", address: j.location } : undefined,
    url: canonical
  };

  const bodyHtml = `
    <div class="brand">DistilleryHub · Jobs</div>
    <h1>${esc(j.title)}</h1>
    <div class="meta">${esc(j.company || "")}${j.location ? " · " + esc(j.location) : ""} · ${esc(j.jobType || "Full-time")}</div>
    <div>${esc(j.description || "").replace(/\n/g, "<br>")}</div>`;

  res.set("Cache-Control", "public, max-age=300, s-maxage=1800");
  res.status(200).send(pageShell({
    title: `${j.title}${j.company ? " at " + j.company : ""} — DistilleryHub`,
    description: description || `${j.title} — job opening on DistilleryHub.`,
    canonical, image: `${SITE}/og-image.svg`, jsonLd, bodyHtml
  }));
});

/* ---------------------------------------------------------------- */
/* 2b. renderArticle                                                   */
/* ---------------------------------------------------------------- */

exports.renderArticle = onRequest(async (req, res) => {
  const id = idFromPath(req, "articles");
  if (!id) { res.status(404).send("Not found"); return; }
  const snap = await db.collection("articles").doc(id).get();
  if (!snap.exists) { res.status(404).send("This article is no longer available."); return; }
  const a = snap.data();
  const canonical = `${SITE}/articles/${id}`;
  const description = (a.body || "").slice(0, 300);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description,
    image: a.imageURL || `${SITE}/og-image.svg`,
    author: { "@type": "Person", name: a.authorName || "DistilleryHub member" },
    datePublished: a.createdAt ? a.createdAt.toDate().toISOString() : undefined,
    url: canonical
  };

  const bodyHtml = `
    <div class="brand">DistilleryHub · Articles</div>
    <h1>${esc(a.title)}</h1>
    <div class="meta">By ${esc(a.authorName || "Member")}</div>
    ${a.imageURL ? `<img class="cover" src="${esc(a.imageURL)}">` : ""}
    <div>${esc(a.body || "").replace(/\n/g, "<br>")}</div>`;

  res.set("Cache-Control", "public, max-age=300, s-maxage=1800");
  res.status(200).send(pageShell({
    title: `${a.title} — DistilleryHub`,
    description: description || `${a.title} — an article on DistilleryHub.`,
    canonical, image: a.imageURL || `${SITE}/og-image.svg`, jsonLd, bodyHtml
  }));
});

/* ---------------------------------------------------------------- */
/* 3. Dynamic sitemap                                                 */
/* ---------------------------------------------------------------- */

exports.sitemap = onRequest(async (req, res) => {
  const staticUrls = [
    { loc: `${SITE}/`, priority: "1.0" }
  ];

  const [jobsSnap, articlesSnap] = await Promise.all([
    db.collection("jobs").orderBy("createdAt", "desc").limit(500).get(),
    db.collection("articles").orderBy("createdAt", "desc").limit(500).get()
  ]);

  const jobUrls = jobsSnap.docs.map(d => ({
    loc: `${SITE}/jobs/${d.id}`,
    lastmod: d.data().createdAt ? d.data().createdAt.toDate().toISOString() : undefined,
    priority: "0.7"
  }));
  const articleUrls = articlesSnap.docs.map(d => ({
    loc: `${SITE}/articles/${d.id}`,
    lastmod: d.data().createdAt ? d.data().createdAt.toDate().toISOString() : undefined,
    priority: "0.7"
  }));

  const all = [...staticUrls, ...jobUrls, ...articleUrls];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${all.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    <priority>${u.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

  res.set("Content-Type", "application/xml");
  res.set("Cache-Control", "public, max-age=1800, s-maxage=3600");
  res.status(200).send(xml);
});
