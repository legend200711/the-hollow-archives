const CATEGORIES = new Set([
  "Supernatural Horror", "Haunted Houses", "Monsters & Creatures",
  "Psychological Horror", "Urban Legends", "Nightmare Stories",
  "Gothic Horror", "Original Fiction", "Other"
]);

const MAX_TITLE = 120;
const MAX_PEN_NAME = 60;
const MAX_DESCRIPTION = 240;
const MIN_STORY_LENGTH = 100;
const MAX_STORY_LENGTH = 30000;
const MAX_REQUEST_BYTES = 45000;

// This is intentionally a rules-based gate, not an AI originality or safety detector.
// Anything that triggers a review rule is stored privately and is not publicly listed.
function checkSubmission(data) {
  const title = clean(data.title, MAX_TITLE);
  const penName = clean(data.pen_name || "Anonymous", MAX_PEN_NAME) || "Anonymous";
  const category = clean(data.category, 50);
  const description = clean(data.description || "", MAX_DESCRIPTION);
  const story = String(data.story || "").trim();

  if (!title || !category || !story) return { error: "Please provide a title, category, and complete story." };
  if (!CATEGORIES.has(category)) return { error: "Please choose a valid horror category." };
  if (story.length < MIN_STORY_LENGTH) return { error: `Stories must be at least ${MIN_STORY_LENGTH} characters long.` };
  if (story.length > MAX_STORY_LENGTH) return { error: `Stories must be no longer than ${MAX_STORY_LENGTH} characters.` };
  if (/[<>]/.test(title) || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(story)) {
    return { error: "Please remove unsupported characters and try again." };
  }

  const email = clean(data.email || "", 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Please enter a valid contact email or leave it blank." };
  }

  // Manual-review flags: don't silently publish likely promotional submissions.
  const reviewReasons = [];
  const urls = (story.match(/https?:\/\/|www\./gi) || []).length;
  if (urls > 0) reviewReasons.push("contains_link");
  if (/(buy now|crypto giveaway|casino bonus|visit my channel|subscribe to my channel)/i.test(story)) {
    reviewReasons.push("possible_promotion");
  }
  if (story.length > 18000) reviewReasons.push("long_story_review");

  return {
    value: { title, penName, category, description, story, email },
    status: reviewReasons.length ? "review" : "approved",
    reviewReasons
  };
}

function clean(value, max) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, max);
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
  });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGIN || "").trim();
  const headers = { "Vary": "Origin" };
  if (allowed && origin === allowed) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }
  return headers;
}

async function verifyTurnstile(token, request, env) {
  // Turnstile is optional during local setup. Configure both variables to enforce it.
  if (!env.TURNSTILE_SECRET_KEY) return { ok: true, skipped: true };
  if (!token) return { ok: false };
  const body = new FormData();
  body.append("secret", env.TURNSTILE_SECRET_KEY);
  body.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.append("remoteip", ip);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body
    });
    const result = await response.json();
    return { ok: result.success === true };
  } catch {
    return { ok: false };
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ ok: true, service: "The Hollow Archives API" }, 200, cors);
    }

    if (url.pathname === "/api/stories" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT id, title, pen_name AS author, category, description, story AS body, published_at AS date FROM stories WHERE status = 'approved' ORDER BY published_at DESC LIMIT 200"
        ).all();
        return json({ stories: results }, 200, { ...cors, "Cache-Control": "public, max-age=60" });
      } catch {
        return json({ error: "The story archive is temporarily unavailable." }, 503, cors);
      }
    }

    if (url.pathname === "/api/submissions" && request.method === "POST") {
      const contentType = request.headers.get("Content-Type") || "";
      if (!contentType.includes("application/json")) return json({ error: "Please submit the form normally." }, 415, cors);
      const declaredLength = Number(request.headers.get("Content-Length") || 0);
      if (declaredLength > MAX_REQUEST_BYTES) return json({ error: "This submission is too large." }, 413, cors);

      let data;
      try { data = await request.json(); }
      catch { return json({ error: "The submission could not be read." }, 400, cors); }

      // Honeypot field: bots that fill it receive a generic success response without storing content.
      if (String(data.website || "").trim()) {
        return json({ ok: true, message: "Submission received." }, 200, cors);
      }

      const challenge = await verifyTurnstile(data.turnstileToken, request, env);
      if (!challenge.ok) return json({ error: "The spam-protection check failed. Please refresh and try again." }, 400, cors);

      if (data.rights !== true || data.guidelines !== true) {
        return json({ error: "Please confirm the story is yours to submit and that you agree to the guidelines." }, 400, cors);
      }

      const checked = checkSubmission(data);
      if (checked.error) return json({ error: checked.error }, 400, cors);

      const { value, status, reviewReasons } = checked;
      const id = crypto.randomUUID();
      const publishedAt = status === "approved" ? new Date().toISOString() : null;
      try {
        await env.DB.prepare(
          "INSERT INTO stories (id, title, pen_name, category, description, story, contact_email, status, review_reasons, submitted_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(
          id, value.title, value.penName, value.category, value.description, value.story,
          value.email || null, status, JSON.stringify(reviewReasons), new Date().toISOString(), publishedAt
        ).run();
      } catch {
        return json({ error: "We couldn't save your submission. Nothing has been confirmed as received; please try again later." }, 503, cors);
      }

      if (status === "review") {
        return json({ ok: true, status, message: "Your story was received and is waiting for a quick manual check before publication." }, 202, cors);
      }
      return json({ ok: true, status, message: "Your story passed the automatic submission checks and has been added to The Hollow Archives." }, 201, cors);
    }

    return json({ error: "Not found." }, 404, cors);
  }
};
