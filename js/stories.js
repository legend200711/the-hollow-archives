/*
Demo stories are shown only when the Cloudflare API is not configured or unavailable.
Replace/remove these demonstration entries before launch.
*/
const DEMO_STORIES = [];
const API_BASE_STORIES = "https://hollow-archives-api.nthntjrn.workers.dev";
let stories = DEMO_STORIES;

function safeText(value) {
 return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function card(story) {
 return `<article class="story-card"><div class="card-art art-${safeText(story.id)}"><span class="card-index">${story.date === "Demo story" ? "ARCHIVE / DEMO" : "THE HOLLOW ARCHIVES"}</span><span class="art-moon"></span><span class="art-tree"></span></div><div class="card-content"><div class="card-meta"><span>${safeText(story.category)}</span><span>${safeText(story.date || "")}</span></div><h3>${safeText(story.title)}</h3><p>${safeText(story.description || "")}</p><button class="read-link" data-read="${safeText(story.id)}">Read story <span>↗</span></button></div></article>`;
}
function showStory(story) {
 const modal = document.createElement("dialog"); modal.className = "story-dialog";
 const paras = String(story.body || "").split(/\n\s*\n/).map(p => `<p>${safeText(p).replace(/\n/g,"<br>")}</p>`).join("");
 modal.innerHTML = `<button class="dialog-close" aria-label="Close story">×</button><p class="eyebrow">${safeText(story.category || "Horror")}${story.date === "Demo story" ? " · DEMONSTRATION" : ""}</p><h2>${safeText(story.title)}</h2><p class="dialog-author">By ${safeText(story.author || "Anonymous")}</p><div class="dialog-body">${paras}</div>${story.date === "Demo story" ? '<p class="demo-note">Demonstration story — replace before launch.</p>' : ""}`;
 document.body.appendChild(modal); modal.showModal(); modal.querySelector(".dialog-close").addEventListener("click",()=>modal.close()); modal.addEventListener("close",()=>modal.remove());
}
document.addEventListener("DOMContentLoaded", async () => {
 const featured = document.getElementById("featured-stories");
 const all = document.getElementById("all-stories");
 if (API_BASE_STORIES) {
  try {
   const response = await fetch(`${API_BASE_STORIES.replace(/\/$/, "")}/api/stories`);
   if (response.ok) {
    const result = await response.json();
    if (Array.isArray(result.stories)) stories = result.stories.map(s => ({...s, id: s.id || s.title, date: s.date ? new Date(s.date).toLocaleDateString() : ""}));
   }
  } catch { /* keep demo content for local preview; API setup is documented in README */ }
 }
 if (featured) featured.innerHTML = stories.slice(0,3).map(card).join("");
 if (all) {
  const search = document.getElementById("story-search"), filter = document.getElementById("category-filter"), empty = document.getElementById("empty-state");
  const params = new URLSearchParams(location.search); if(params.has("category")) filter.value = params.get("category");
  function render() {
   const q = search.value.toLowerCase().trim(), cat = filter.value;
   const matches = stories.filter(s => (cat === "all" || s.category === cat) && (s.title+" "+(s.description||"")+" "+(s.body||"")+" "+s.category).toLowerCase().includes(q));
   all.innerHTML = matches.map(card).join(""); empty.hidden = matches.length > 0;
  }
  search.addEventListener("input",render); filter.addEventListener("change",render); render();
 }
 document.addEventListener("click", e => { const btn = e.target.closest("[data-read]"); if(btn){ const story=stories.find(s=>String(s.id)===btn.dataset.read); if(story)showStory(story); }});
});
