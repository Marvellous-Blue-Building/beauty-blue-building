/*!
 * Beauty Advisor embeddable widget — loader + Shadow DOM mount.
 * Pattern borrowed from a colleague's separate "Ganes" widget (script tag →
 * Shadow DOM → SSE chat, origin-gated), stripped of multi-tenancy: single
 * backend per deployment, no data-store-id/org scoping.
 *
 * Embed with: <script src="https://<host>/widget-loader.js" async></script>
 * Optional: data-api-base="https://your-backend.example" (defaults to this
 * script's own origin).
 */
(function () {
  "use strict";

  var script = document.currentScript || document.querySelector("script[src*='widget-loader.js']");
  if (!script) return;

  var API_BASE = script.getAttribute("data-api-base") || new URL(script.src, location.href).origin;
  var SESSION_KEY = "bw_session_id";
  var CONVO_KEY = "bw_conversation_id";

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) { /* ignore */ }
  }

  function api(path, opts) {
    return fetch(API_BASE + path, opts).then(function (res) {
      if (!res.ok) throw new Error("request failed: " + res.status);
      return res;
    });
  }

  function ensureSession() {
    var existing = storageGet(SESSION_KEY);
    if (existing) return Promise.resolve(existing);
    return api("/api/widget/session", { method: "POST" })
      .then(function (res) { return res.json(); })
      .then(function (data) { storageSet(SESSION_KEY, data.sessionId); return data.sessionId; });
  }

  function fetchConfig() {
    return api("/api/widget/config").then(function (res) { return res.json(); }).catch(function () {
      return { botName: "Vera", greeting: "Hai! Ada yang bisa aku bantu?", color: "#7A4259", position: "br" };
    });
  }

  // Streams the chat SSE response and calls onFrame({type, payload}) per frame.
  function streamChat(sessionId, conversationId, message, onFrame) {
    return fetch(API_BASE + "/api/widget/chat", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ sessionId: sessionId, conversationId: conversationId, message: message }),
    }).then(function (res) {
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      function pump() {
        return reader.read().then(function (result) {
          if (result.done) return;
          buffer += decoder.decode(result.value, { stream: true });
          var parts = buffer.split("\n\n");
          buffer = parts.pop();
          parts.forEach(function (part) {
            var line = part.trim();
            if (!line.startsWith("data:")) return;
            try {
              var frame = JSON.parse(line.slice(5).trim());
              onFrame(frame);
            } catch (e) { /* ignore malformed frame */ }
          });
          return pump();
        });
      }
      return pump();
    });
  }

  var STYLE = function (cfg) {
    return (
      ":host, *{box-sizing:border-box;}" +
      ":host{--bw-primary:" + (cfg.color || "#7A4259") + ";--bw-ink:#241F26;--bw-paper:#FAF6F3;--bw-line:rgba(36,31,38,.14);" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}" +
      ".bw-launcher{position:fixed;" + (cfg.position === "bl" ? "left:20px;" : "right:20px;") + "bottom:20px;width:58px;height:58px;" +
      "border-radius:50%;border:none;cursor:pointer;background:var(--bw-primary);color:#fff;display:flex;" +
      "align-items:center;justify-content:center;box-shadow:0 10px 24px -8px rgba(0,0,0,.35);z-index:2147483000;}" +
      ".bw-launcher svg{width:26px;height:26px;}" +
      ".bw-panel{position:fixed;" + (cfg.position === "bl" ? "left:20px;" : "right:20px;") + "bottom:88px;width:320px;max-width:calc(100vw - 40px);" +
      "height:460px;max-height:calc(100vh - 120px);background:#fff;border:1px solid var(--bw-line);border-radius:16px;" +
      "box-shadow:0 24px 48px -20px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden;z-index:2147483000;}" +
      ".bw-panel[hidden]{display:none;}" +
      ".bw-head{display:flex;align-items:center;gap:10px;padding:13px 14px;background:var(--bw-primary);color:#fff;flex:none;}" +
      ".bw-avatar{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;" +
      "align-items:center;justify-content:center;font-weight:700;font-size:13px;flex:none;}" +
      ".bw-head .bw-name{font-weight:700;font-size:13.5px;}" +
      ".bw-head .bw-status{font-size:10.5px;opacity:.85;}" +
      ".bw-head button{margin-left:auto;background:none;border:none;color:#fff;opacity:.85;cursor:pointer;}" +
      ".bw-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--bw-ink);}" +
      ".bw-row{display:flex;}" +
      ".bw-row.user{justify-content:flex-end;}" +
      ".bw-bubble{max-width:84%;padding:9px 12px;border-radius:13px;line-height:1.48;}" +
      ".bw-row.bot .bw-bubble{background:#F3ECE6;border-bottom-left-radius:4px;}" +
      ".bw-row.user .bw-bubble{background:var(--bw-primary);color:#fff;border-bottom-right-radius:4px;}" +
      ".bw-card{display:flex;gap:9px;border:1px solid var(--bw-line);border-radius:11px;padding:8px;background:#fff;margin-top:6px;}" +
      ".bw-card .bw-ic{width:36px;height:36px;border-radius:8px;flex:none;background:#F3ECE6;" +
      "display:flex;align-items:center;justify-content:center;font-size:16px;}" +
      ".bw-card .bw-meta{min-width:0;}" +
      ".bw-card .bw-brand{font-size:10px;text-transform:uppercase;letter-spacing:.05em;opacity:.6;}" +
      ".bw-card .bw-pname{font-size:12px;font-weight:600;line-height:1.3;margin:1px 0 3px;}" +
      ".bw-card .bw-price{font-size:11px;font-weight:600;}" +
      ".bw-foot{border-top:1px solid var(--bw-line);padding:9px 10px;display:flex;gap:7px;flex:none;}" +
      ".bw-foot input{flex:1;min-width:0;border:1px solid var(--bw-line);border-radius:999px;padding:8px 13px;font-size:12.5px;" +
      "font-family:inherit;color:var(--bw-ink);}" +
      ".bw-foot button{width:34px;height:34px;border-radius:50%;border:none;background:var(--bw-primary);color:#fff;" +
      "display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;}" +
      ".bw-typing{display:flex;gap:4px;padding:9px 12px;background:#F3ECE6;border-radius:13px;width:fit-content;border-bottom-left-radius:4px;}" +
      ".bw-typing span{width:5px;height:5px;border-radius:50%;background:#999;display:inline-block;animation:bwb 1.1s infinite ease-in-out;}" +
      ".bw-typing span:nth-child(2){animation-delay:.15s;}.bw-typing span:nth-child(3){animation-delay:.3s;}" +
      "@keyframes bwb{0%,80%,100%{transform:translateY(0);opacity:.35;}40%{transform:translateY(-3px);opacity:.9;}}"
    );
  };

  function el(html) {
    var d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function mount() {
    var host = document.createElement("div");
    host.id = "bw-widget-host";
    document.body.appendChild(host);
    var shadow = host.attachShadow({ mode: "open" });

    var state = { sessionId: null, conversationId: storageGet(CONVO_KEY), config: null };

    Promise.all([ensureSession(), fetchConfig()]).then(function (res) {
      state.sessionId = res[0];
      state.config = res[1];

      var styleEl = document.createElement("style");
      styleEl.textContent = STYLE(state.config);
      shadow.appendChild(styleEl);

      var launcher = el(
        '<button class="bw-launcher" aria-label="Buka AI Beauty Advisor">' +
          '<svg viewBox="0 0 24 24" fill="none"><path d="M5 19l1.4-4.2A8 8 0 1112 20l-7 1z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>' +
        "</button>"
      );
      var panel = el(
        '<div class="bw-panel" hidden>' +
          '<div class="bw-head">' +
            '<div class="bw-avatar">' + (state.config.botName || "V").charAt(0) + "</div>" +
            '<div><div class="bw-name"></div><div class="bw-status">Online</div></div>' +
            '<button aria-label="Tutup">&times;</button>' +
          "</div>" +
          '<div class="bw-body"></div>' +
          '<div class="bw-foot">' +
            '<input type="text" placeholder="Tulis pertanyaan…" />' +
            '<button aria-label="Kirim">&#8594;</button>' +
          "</div>" +
        "</div>"
      );
      panel.querySelector(".bw-name").textContent = state.config.botName || "Vera";
      shadow.appendChild(panel);
      shadow.appendChild(launcher);

      var body = panel.querySelector(".bw-body");
      var input = panel.querySelector("input");
      var sendBtn = panel.querySelector(".bw-foot button");
      var closeBtn = panel.querySelector(".bw-head button");

      function addBotText(text) {
        var row = el('<div class="bw-row bot"><div class="bw-bubble"></div></div>');
        row.querySelector(".bw-bubble").textContent = text;
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
      }
      function addUserText(text) {
        var row = el('<div class="bw-row user"><div class="bw-bubble"></div></div>');
        row.querySelector(".bw-bubble").textContent = text;
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
      }
      function addProducts(products) {
        if (!products || !products.length) return;
        var row = el('<div class="bw-row bot" style="flex-direction:column;align-items:stretch;max-width:92%;"></div>');
        products.slice(0, 3).forEach(function (p) {
          var card = el(
            '<div class="bw-card">' +
              '<div class="bw-ic">&#10022;</div>' +
              '<div class="bw-meta">' +
                '<div class="bw-brand"></div>' +
                '<div class="bw-pname"></div>' +
                '<div class="bw-price"></div>' +
              "</div>" +
            "</div>"
          );
          card.querySelector(".bw-brand").textContent = p.brand || "";
          card.querySelector(".bw-pname").textContent = p.name || "";
          card.querySelector(".bw-price").textContent = p.price != null ? "Rp " + Number(p.price).toLocaleString("id-ID") : "";
          row.appendChild(card);
        });
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
      }
      function addTyping() {
        var row = el('<div class="bw-row bot"><div class="bw-typing"><span></span><span></span><span></span></div></div>');
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
        return row;
      }

      function send(text) {
        if (!text || !text.trim()) return;
        addUserText(text);
        var typingRow = addTyping();
        streamChat(state.sessionId, state.conversationId, text, function (frame) {
          if (frame.type === "start") {
            state.conversationId = frame.payload.conversationId;
            storageSet(CONVO_KEY, state.conversationId);
          } else if (frame.type === "done") {
            typingRow.remove();
            addBotText(frame.payload.answer);
            addProducts(frame.payload.products);
          } else if (frame.type === "error") {
            typingRow.remove();
            addBotText("Maaf, ada gangguan di server. Coba lagi sebentar lagi ya.");
          }
        }).catch(function () {
          typingRow.remove();
          addBotText("Maaf, tidak bisa terhubung ke server sekarang.");
        });
      }

      sendBtn.addEventListener("click", function () {
        var v = input.value;
        input.value = "";
        send(v);
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          var v = input.value;
          input.value = "";
          send(v);
        }
      });

      function openPanel() { panel.hidden = false; }
      function closePanel() { panel.hidden = true; }
      launcher.addEventListener("click", function () { panel.hidden = !panel.hidden; });
      closeBtn.addEventListener("click", closePanel);

      addBotText(state.config.greeting || "Hai! Ada yang bisa aku bantu?");

      // Public API, same shape as Ganes' window.GanesWidget.
      window.BeautyWidget = {
        open: openPanel,
        close: closePanel,
        toggle: function () { panel.hidden = !panel.hidden; },
        ask: function (text) { openPanel(); send(text); },
        send: send,
        reset: function () {
          state.conversationId = null;
          storageSet(CONVO_KEY, "");
          body.innerHTML = "";
          addBotText(state.config.greeting || "Hai! Ada yang bisa aku bantu?");
        },
      };
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
