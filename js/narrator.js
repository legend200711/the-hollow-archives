/*
 * The Hollow Archives — Narrator
 * Web Speech API text-to-speech module.
 * Exposes a single global `Narrator` object consumed by stories.js.
 */
(function () {
  "use strict";

  const supported = "speechSynthesis" in window;

  /* ─── state ─────────────────────────────────────────────────────────────── */
  let currentPanel = null; // the live narrator DOM node
  let state = "idle"; // idle | playing | paused | finished

  /* ─── voice loading ──────────────────────────────────────────────────────── */
  let _voices = [];
  function loadVoices() {
    _voices = speechSynthesis.getVoices();
  }
  if (supported) {
    loadVoices();
    speechSynthesis.addEventListener("voiceschanged", () => {
      loadVoices();
      if (currentPanel) populateVoiceSelect(currentPanel.querySelector(".narrator-voice"));
    });
  }

  function getVoices() {
    if (_voices.length) return _voices;
    return speechSynthesis.getVoices(); // sync fallback
  }

  function populateVoiceSelect(select) {
    if (!select) return;
    const prev = select.value;
    select.innerHTML = "";
    const voices = getVoices();
    if (!voices.length) {
      select.innerHTML = '<option value="">Default voice</option>';
      return;
    }
    voices.forEach((v, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = `${v.name} (${v.lang})`;
      select.appendChild(opt);
    });
    // restore previous or pick a decent English default
    if (prev !== "" && select.options[prev]) {
      select.value = prev;
    } else {
      const defIdx = voices.findIndex(v => /en[-_]/i.test(v.lang) && v.default);
      const enIdx  = voices.findIndex(v => /en[-_]/i.test(v.lang));
      select.selectedIndex = defIdx >= 0 ? defIdx : enIdx >= 0 ? enIdx : 0;
    }
  }

  /* ─── speech ─────────────────────────────────────────────────────────────── */
  function buildScript(story) {
    const parts = [];
    parts.push(story.title || "Untitled");
    if (story.author) parts.push(`By ${story.author}.`);
    // split body on double-newline paragraphs, strip any residual HTML
    const body = String(story.body || "").replace(/<[^>]*>/g, " ").trim();
    body.split(/\n\s*\n/).forEach(p => {
      const t = p.replace(/\n/g, " ").trim();
      if (t) parts.push(t);
    });
    return parts;
  }

  let utterances = [];
  let utteranceIndex = 0;

  function stopSpeech() {
    speechSynthesis.cancel();
    utterances = [];
    utteranceIndex = 0;
  }

  function speak(script, onEnd) {
    stopSpeech();
    utterances = script.map(text => {
      const u = new SpeechSynthesisUtterance(text);
      return u;
    });
    utteranceIndex = 0;
    if (!utterances.length) { onEnd && onEnd(); return; }

    function speakNext() {
      if (utteranceIndex >= utterances.length) {
        onEnd && onEnd();
        return;
      }
      const u = utterances[utteranceIndex];
      u.onend = () => { utteranceIndex++; speakNext(); };
      u.onerror = e => { if (e.error !== "interrupted" && e.error !== "canceled") { utteranceIndex++; speakNext(); } };
      speechSynthesis.speak(u);
    }
    speakNext();
  }

  function applyVoiceAndRate(voiceIndex, rate) {
    const voices = getVoices();
    utterances.forEach(u => {
      if (voiceIndex !== "" && voices[voiceIndex]) u.voice = voices[voiceIndex];
      u.rate = parseFloat(rate) || 1;
    });
  }

  /* ─── panel builder ──────────────────────────────────────────────────────── */
  function createPanel(story) {
    const panel = document.createElement("div");
    panel.className = "narrator-panel";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "Read aloud controls");

    panel.innerHTML = `
      <div class="narrator-top">
        <span class="narrator-icon" aria-hidden="true">🔊</span>
        <span class="narrator-label">Read Aloud</span>
        <span class="narrator-status" aria-live="polite" aria-atomic="true"></span>
      </div>
      <div class="narrator-controls">
        <button class="narrator-btn narrator-play"  aria-label="Read aloud" title="Read aloud">▶</button>
        <button class="narrator-btn narrator-pause" aria-label="Pause narration" title="Pause" disabled>⏸</button>
        <button class="narrator-btn narrator-stop"  aria-label="Stop narration" title="Stop" disabled>⏹</button>
      </div>
      <div class="narrator-options">
        <label class="narrator-option-label">
          <span>Voice</span>
          <select class="narrator-voice" aria-label="Select narrator voice"></select>
        </label>
        <label class="narrator-option-label">
          <span>Speed</span>
          <select class="narrator-rate" aria-label="Reading speed">
            <option value="0.75">0.75×</option>
            <option value="0.9">0.9×</option>
            <option value="1" selected>1×</option>
            <option value="1.15">1.15×</option>
            <option value="1.3">1.3×</option>
            <option value="1.5">1.5×</option>
          </select>
        </label>
      </div>
    `;

    populateVoiceSelect(panel.querySelector(".narrator-voice"));

    if (!supported) {
      panel.innerHTML = `<p class="narrator-unsupported">Text-to-speech is not supported in this browser.</p>`;
      return panel;
    }

    const playBtn   = panel.querySelector(".narrator-play");
    const pauseBtn  = panel.querySelector(".narrator-pause");
    const stopBtn   = panel.querySelector(".narrator-stop");
    const statusEl  = panel.querySelector(".narrator-status");
    const voiceSel  = panel.querySelector(".narrator-voice");
    const rateSel   = panel.querySelector(".narrator-rate");

    function setStatus(s) {
      state = s;
      const labels = { idle: "", playing: "● Narrating…", paused: "❚❚ Paused", finished: "✓ Finished" };
      statusEl.textContent = labels[s] || "";
      playBtn.disabled   = s === "playing";
      pauseBtn.disabled  = s === "idle" || s === "finished";
      stopBtn.disabled   = s === "idle" || s === "finished";
      panel.dataset.state = s;
    }

    function doPlay() {
      const script = buildScript(story);
      speak(script, () => setStatus("finished"));
      applyVoiceAndRate(voiceSel.value, rateSel.value);
      setStatus("playing");
    }

    playBtn.addEventListener("click", () => {
      if (state === "paused") {
        speechSynthesis.resume();
        setStatus("playing");
      } else {
        doPlay();
      }
    });

    pauseBtn.addEventListener("click", () => {
      if (state === "playing") {
        speechSynthesis.pause();
        setStatus("paused");
      }
    });

    stopBtn.addEventListener("click", () => {
      stopSpeech();
      setStatus("idle");
    });

    voiceSel.addEventListener("change", () => {
      if (state === "playing" || state === "paused") doPlay();
    });

    rateSel.addEventListener("change", () => {
      if (state === "playing" || state === "paused") doPlay();
    });

    setStatus("idle");
    currentPanel = panel;
    return panel;
  }

  /* ─── public API ─────────────────────────────────────────────────────────── */
  window.Narrator = {
    /** Call when opening a new story dialog. Returns the panel DOM node. */
    attach(story) {
      // Always stop whatever was playing before
      stopSpeech();
      state = "idle";
      currentPanel = null;
      return createPanel(story);
    },
    /** Call when the story dialog closes. */
    detach() {
      stopSpeech();
      state = "idle";
      currentPanel = null;
    }
  };
})();
