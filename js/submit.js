/*
The Hollow Archives submission client.
Set API_BASE to your deployed Cloudflare Worker URL before launch.
Never place the Turnstile secret key or any other private key in this file.
*/
const API_BASE = "https://hollow-archives-api.nthntjrn.workers.dev";
const TURNSTILE_SITE_KEY = ""; // Optional: public Turnstile site key. Never use the secret key here.

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("story-form");
  const message = document.getElementById("form-message");
  const button = form.querySelector('button[type="submit"]');
  const challengeContainer = document.getElementById("turnstile-container");
  let turnstileWidgetId = null;
  let turnstileToken = "";

  if (TURNSTILE_SITE_KEY && challengeContainer) {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) {
        turnstileWidgetId = window.turnstile.render(challengeContainer, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: token => { turnstileToken = token; },
          "expired-callback": () => { turnstileToken = ""; },
          "error-callback": () => { turnstileToken = ""; }
        });
      }
    };
    document.head.appendChild(script);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    if (!API_BASE) {
      message.className = "form-message error";
      message.textContent = "The Cloudflare submission service is not connected yet. Your story has NOT been sent or saved.";
      return;
    }

    const data = new FormData(form);
    const payload = {
      title: data.get("title"),
      pen_name: data.get("pen_name"),
      category: data.get("category"),
      description: data.get("description"),
      story: data.get("story"),
      email: data.get("email"),
      rights: data.get("rights") === "on",
      guidelines: data.get("guidelines") === "on",
      website: data.get("website"),
      turnstileToken
    };

    button.disabled = true;
    button.textContent = "Checking the archives…";
    message.className = "form-message";
    message.textContent = "";

    try {
      const response = await fetch(`${API_BASE.replace(/\/$/, "")}/api/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "The submission could not be saved.");
      }
      message.className = "form-message success";
      message.textContent = result.message || "Your story was received.";
      form.reset();
      turnstileToken = "";
      if (window.turnstile && turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
    } catch (error) {
      message.className = "form-message error";
      message.textContent = error.message || "We couldn't send your story. Nothing has been confirmed as received.";
    } finally {
      button.disabled = false;
      button.textContent = "Send to the Keeper ↗";
    }
  });
});
