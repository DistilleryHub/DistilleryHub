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
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const SITE = "https://thedistillerymaster.com";

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
    // FEATURE: group chat / group call notification copy.
    case "group_add": return { title: n.groupName || "New group", body: `${name} added you to ${n.groupName || "a group"}` };
    case "group_call": return { title: n.groupName || "Group call", body: `${name} started a call in ${n.groupName || "a group"}` };
    case "mention": return { title: name, body: "Mentioned you in a group chat" };
    case "job_application": return { title: "New job application", body: `${name} applied to ${n.jobTitle || "your job posting"}` };
    default: return { title: "DistilleryHub", body: `${name} interacted with your activity` };
  }
}

exports.sendNotificationPush = onDocumentCreated("notifications/{notificationId}", async (event) => {
  const n = event.data.data();
  if (!n || !n.userId) return;
  // FEATURE (chat mute): the client still writes the notification doc so
  // the in-app bell/unread badge stays accurate, but flags it "silent"
  // when the recipient has muted that conversation. Respect that here by
  // skipping the device push — the in-app notification remains untouched.
  if (n.silent) return;

  const userSnap = await db.collection("users").doc(n.userId).get();
  if (!userSnap.exists) return;
  const userData = userSnap.data();
  // FEATURE: per-type notification preferences (users/{uid}.notifPrefs),
  // set from the Notification settings screen. Defaults to enabled when a
  // type has no explicit preference saved yet. The in-app notification doc
  // is still created either way — this only gates the device push.
  if (userData.notifPrefs && userData.notifPrefs[n.type] === false) return;
  const tokens = userData.fcmTokens || [];
  if (!tokens.length) return;

  const { title, body } = notificationCopy(n);

  const resp = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
    webpush: {
      notification: { icon: `${SITE}/favicon.svg` },
      fcmOptions: { link: n.type === "message" ? `${SITE}/?open=chat` : SITE }
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
/* PRODUCTION: server-side rate limiting / spam guard.                */
/* Firestore rules can't easily enforce "no more than N writes per    */
/* minute" on their own, so this does it in a Cloud Function instead: */
/* every new post/message bumps a small rolling counter doc, and if   */
/* someone blows past a sane threshold, the just-created doc is       */
/* deleted (silently, from the abuser's point of view — no error UX   */
/* to build, it just won't show up for anyone else).                  */
/* ---------------------------------------------------------------- */
async function enforceRateLimit(uid, bucket, maxCount, windowMs, offendingRef) {
  const limitRef = db.collection("rateLimits").doc(`${uid}_${bucket}`);
  const blocked = await db.runTransaction(async (tx) => {
    const snap = await tx.get(limitRef);
    const now = Date.now();
    const data = snap.exists ? snap.data() : null;
    const windowStart = data && data.windowStart ? data.windowStart.toMillis() : 0;
    if (data && now - windowStart < windowMs) {
      const count = (data.count || 0) + 1;
      tx.set(limitRef, { windowStart: data.windowStart, count }, { merge: true });
      return count > maxCount;
    }
    tx.set(limitRef, { windowStart: admin.firestore.Timestamp.fromMillis(now), count: 1 });
    return false;
  });
  if (blocked) {
    await offendingRef.delete().catch(() => {});
  }
  return blocked;
}

exports.rateLimitPosts = onDocumentCreated("posts/{postId}", async (event) => {
  const p = event.data.data();
  if (!p || !p.authorUid) return;
  // max 8 posts per 60s per user
  await enforceRateLimit(p.authorUid, "posts", 8, 60000, event.data.ref);
});

exports.rateLimitMessages = onDocumentCreated("conversations/{convoId}/messages/{messageId}", async (event) => {
  const m = event.data.data();
  if (!m || !m.senderUid) return;
  // max 30 messages per 10s per user — generous for real chat, still
  // catches a runaway script or someone hammering the send button.
  await enforceRateLimit(m.senderUid, "messages", 30, 10000, event.data.ref);
});

exports.rateLimitComments = onDocumentCreated("posts/{postId}/comments/{commentId}", async (event) => {
  const c = event.data.data();
  if (!c || !c.authorUid) return;
  await enforceRateLimit(c.authorUid, "comments", 15, 60000, event.data.ref);
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

  // FIX (bug): Google's JobPosting rich-result validator requires
  // jobLocation.address to be a PostalAddress object, not a bare string —
  // a plain string address silently fails validation. It also requires
  // either validThrough or an explicit application deadline, or the
  // posting is ineligible for the Jobs rich result entirely. We don't
  // collect a structured address or an expiry date in the app today, so
  // this uses addressLocality as a reasonable approximation and defaults
  // validThrough to 90 days after posting — revisit if the job form ever
  // grows a real expiry field.
  const postedDate = j.createdAt ? j.createdAt.toDate() : new Date();
  const validThrough = new Date(postedDate.getTime() + 90 * 24 * 60 * 60 * 1000);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: j.title,
    description: j.description || j.title,
    datePosted: j.createdAt ? postedDate.toISOString() : undefined,
    validThrough: validThrough.toISOString(),
    employmentType: (j.jobType || "FULL_TIME").toUpperCase().replace(/[- ]/g, "_"),
    hiringOrganization: { "@type": "Organization", name: j.company || "DistilleryHub" },
    jobLocation: j.location ? {
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: j.location }
    } : undefined,
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
    canonical, image: `${SITE}/og-image.png`, jsonLd, bodyHtml
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
    image: a.imageURL || `${SITE}/og-image.png`,
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
    canonical, image: a.imageURL || `${SITE}/og-image.png`, jsonLd, bodyHtml
  }));
});

/* ---------------------------------------------------------------- */
/* 3. Dynamic sitemap                                                 */
/* ---------------------------------------------------------------- */

exports.sitemap = onRequest(async (req, res) => {
  const staticUrls = [
    { loc: `${SITE}/`, priority: "1.0" },
    { loc: `${SITE}/privacy.html`, priority: "0.3" },
    { loc: `${SITE}/terms.html`, priority: "0.3" }
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
