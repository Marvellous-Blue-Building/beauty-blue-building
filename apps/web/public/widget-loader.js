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
      "@keyframes bwb{0%,80%,100%{transform:translateY(0);opacity:.35;}40%{transform:translateY(-3px);opacity:.9;}}" +
      ".bw-head .bw-scanbtn{margin-left:8px;}" +
      ".bw-scanview{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px;color:var(--bw-ink);}" +
      ".bw-scanview[hidden]{display:none;}" +
      ".bw-video{width:100%;border-radius:12px;background:#111;aspect-ratio:3/4;object-fit:cover;}" +
      ".bw-canvas{display:none;}" +
      ".bw-scan-actions{display:flex;gap:8px;}" +
      ".bw-btn-primary{flex:1;background:var(--bw-primary);color:#fff;border:none;border-radius:999px;padding:10px;font-size:12.5px;font-weight:600;cursor:pointer;}" +
      ".bw-btn-ghost{flex:1;background:#fff;border:1px solid var(--bw-line);border-radius:999px;padding:9px;font-size:12.5px;cursor:pointer;color:var(--bw-ink);}" +
      ".bw-scan-overall{text-align:center;padding:10px 0;}" +
      ".bw-scan-overall .num{font-size:42px;font-weight:700;color:var(--bw-primary);line-height:1;}" +
      ".bw-scan-overall .lbl{font-size:11px;opacity:.6;margin-top:4px;}" +
      ".bw-scan-metric{display:flex;flex-direction:column;gap:4px;}" +
      ".bw-scan-metric .row{display:flex;justify-content:space-between;font-size:11.5px;}" +
      ".bw-scan-bar{height:6px;border-radius:999px;background:#F3ECE6;overflow:hidden;}" +
      ".bw-scan-bar div{height:100%;background:var(--bw-primary);}" +
      ".bw-scan-flag{font-size:11.5px;line-height:1.4;background:#F3ECE6;border-radius:8px;padding:8px 10px;}" +
      ".bw-scan-error{font-size:12.5px;line-height:1.5;color:#9A3B3B;background:#FBEAEA;border-radius:10px;padding:12px;}" +
      ".bw-scan-note{font-size:10.5px;opacity:.55;text-align:center;}" +
      ".bw-scan-spinner{display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 0;font-size:12.5px;opacity:.7;}" +
      ".bw-spin{width:26px;height:26px;border-radius:50%;border:3px solid #F3ECE6;border-top-color:var(--bw-primary);animation:bwspin .8s linear infinite;}" +
      "@keyframes bwspin{to{transform:rotate(360deg);}}" +
      ".bw-tone-row{display:flex;align-items:center;gap:14px;padding:6px 0 10px;}" +
      ".bw-tone-swatch{width:52px;height:52px;border-radius:50%;flex:none;border:2px solid #fff;box-shadow:0 0 0 1px var(--bw-line);}" +
      ".bw-tone-meta b{font-size:14px;text-transform:capitalize;}" +
      ".bw-tone-meta div{font-size:11px;opacity:.65;}" +
      ".bw-shade-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}" +
      ".bw-shade-card{border:1px solid var(--bw-line);border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px;}" +
      ".bw-shade-dot{width:100%;height:28px;border-radius:6px;}" +
      ".bw-shade-card .bw-sname{font-size:10.5px;font-weight:600;line-height:1.3;}" +
      ".bw-shade-card .bw-sbrand{font-size:9.5px;opacity:.6;text-transform:uppercase;}" +
      ".bw-shade-card .bw-sprice{font-size:10.5px;font-weight:600;}"
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
            '<button class="bw-scanbtn" aria-label="Scan kulit" title="Scan kulit">' +
              '<svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="M4 7a2 2 0 012-2h2l1.5-2h5L16 5h2a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.6"/></svg>' +
            "</button>" +
            '<button aria-label="Tutup">&times;</button>' +
          "</div>" +
          '<div class="bw-body"></div>' +
          '<div class="bw-scanview" hidden></div>' +
          '<canvas class="bw-canvas"></canvas>' +
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
      var closeBtn = panel.querySelector(".bw-head > button[aria-label='Tutup']");
      var scanBtn = panel.querySelector(".bw-scanbtn");
      var scanView = panel.querySelector(".bw-scanview");
      var canvas = panel.querySelector(".bw-canvas");
      var footEl = panel.querySelector(".bw-foot");
      var cameraStream = null;
      var lastCapturedDataUrl = null;

      function stopCamera() {
        if (cameraStream) {
          cameraStream.getTracks().forEach(function (t) { t.stop(); });
          cameraStream = null;
        }
      }

      function showChatView() {
        stopCamera();
        scanView.hidden = true;
        body.hidden = false;
        footEl.hidden = false;
      }

      function renderScanError(message) {
        scanView.innerHTML = "";
        var box = el('<div class="bw-scan-error"></div>');
        box.textContent = message;
        scanView.appendChild(box);
        var actions = el('<div class="bw-scan-actions"></div>');
        var retry = el('<button class="bw-btn-primary">Coba Lagi</button>');
        var back = el('<button class="bw-btn-ghost">Kembali ke Chat</button>');
        retry.addEventListener("click", renderScanCamera);
        back.addEventListener("click", showChatView);
        actions.appendChild(retry);
        actions.appendChild(back);
        scanView.appendChild(actions);
      }

      function scoreBand(score) {
        if (score >= 80) return "Sangat baik";
        if (score >= 60) return "Baik";
        if (score >= 40) return "Cukup";
        return "Perlu perhatian";
      }

      function renderScanResult(report) {
        scanView.innerHTML = "";
        var overall = el(
          '<div class="bw-scan-overall"><div class="num"></div><div class="lbl">Skor kulit keseluruhan</div></div>'
        );
        overall.querySelector(".num").textContent = Math.round(report.overall);
        scanView.appendChild(overall);

        var metrics = [
          ["Hidrasi", report.hydration],
          ["Elastisitas", report.elasticity],
          ["Pigmentasi", report.pigmentation],
          ["Tekstur", report.texture],
          ["Pori-pori", report.pores],
        ];
        metrics.forEach(function (m) {
          var row = el(
            '<div class="bw-scan-metric">' +
              '<div class="row"><span></span><span></span></div>' +
              '<div class="bw-scan-bar"><div></div></div>' +
            "</div>"
          );
          var spans = row.querySelectorAll(".row span");
          spans[0].textContent = m[0];
          spans[1].textContent = Math.round(m[1]) + " · " + scoreBand(m[1]);
          row.querySelector(".bw-scan-bar div").style.width = Math.max(4, Math.round(m[1])) + "%";
          scanView.appendChild(row);
        });

        if (report.flaggedZones && report.flaggedZones.length) {
          report.flaggedZones.slice(0, 3).forEach(function (z) {
            var flag = el('<div class="bw-scan-flag"></div>');
            flag.textContent = "⚠ " + z.zone + " — " + z.description;
            scanView.appendChild(flag);
          });
        }

        var colorBtn = el('<button class="bw-btn-primary">Cek Shade Makeup</button>');
        colorBtn.addEventListener("click", analyzeColor);
        scanView.appendChild(colorBtn);

        var actions = el('<div class="bw-scan-actions"></div>');
        var again = el('<button class="bw-btn-ghost">Scan Lagi</button>');
        var chat = el('<button class="bw-btn-ghost">Tanya di Chat</button>');
        again.addEventListener("click", renderScanCamera);
        chat.addEventListener("click", function () {
          showChatView();
          addBotText("Hasil scan sudah aku lihat. Mau rekomendasi produk berdasarkan hasil ini? Ceritain juga concern utamamu ya.");
        });
        actions.appendChild(again);
        actions.appendChild(chat);
        scanView.appendChild(actions);
      }

      function renderColorError(message) {
        scanView.innerHTML = "";
        var box = el('<div class="bw-scan-error"></div>');
        box.textContent = message;
        scanView.appendChild(box);
        var back = el('<button class="bw-btn-ghost">Kembali</button>');
        back.addEventListener("click", renderScanCamera);
        scanView.appendChild(back);
      }

      function undertoneLabel(u) {
        if (u === "warm") return "Hangat (warm)";
        if (u === "cool") return "Sejuk (cool)";
        return "Netral";
      }

      function renderColorResult(data) {
        scanView.innerHTML = "";
        var toneRow = el(
          '<div class="bw-tone-row">' +
            '<div class="bw-tone-swatch"></div>' +
            '<div class="bw-tone-meta"><b></b><div>Undertone</div><div class="depth"></div></div>' +
          "</div>"
        );
        toneRow.querySelector(".bw-tone-swatch").style.background = data.skinToneHex;
        toneRow.querySelector("b").textContent = undertoneLabel(data.undertone);
        toneRow.querySelector(".depth").textContent = "Kedalaman warna: " + data.depthCategory;
        scanView.appendChild(toneRow);

        scanView.appendChild(el('<div class="bw-scan-note" style="text-align:left">Shade paling cocok dari katalog, diurutkan berdasarkan kedekatan warna kulitmu:</div>'));

        if (data.shades && data.shades.length) {
          var grid = el('<div class="bw-shade-grid"></div>');
          data.shades.slice(0, 6).forEach(function (s) {
            var card = el(
              '<div class="bw-shade-card">' +
                '<div class="bw-shade-dot"></div>' +
                '<div class="bw-sbrand"></div>' +
                '<div class="bw-sname"></div>' +
                '<div class="bw-sprice"></div>' +
              "</div>"
            );
            card.querySelector(".bw-shade-dot").style.background = s.colorHex;
            card.querySelector(".bw-sbrand").textContent = s.brand || "";
            card.querySelector(".bw-sname").textContent = (s.colorName ? s.colorName + " — " : "") + s.name;
            card.querySelector(".bw-sprice").textContent = s.price != null ? "Rp " + Number(s.price).toLocaleString("id-ID") : "";
            grid.appendChild(card);
          });
          scanView.appendChild(grid);
        } else {
          scanView.appendChild(el('<div class="bw-scan-note">Belum ada shade yang cukup dekat di katalog saat ini.</div>'));
        }

        var actions = el('<div class="bw-scan-actions"></div>');
        var again = el('<button class="bw-btn-ghost">Scan Lagi</button>');
        var chat = el('<button class="bw-btn-primary">Tanya di Chat</button>');
        again.addEventListener("click", renderScanCamera);
        chat.addEventListener("click", function () {
          showChatView();
          addBotText("Sudah lihat shade yang cocok buat kamu. Mau aku bantu cari produk lain juga?");
        });
        actions.appendChild(again);
        actions.appendChild(chat);
        scanView.appendChild(actions);
      }

      function analyzeColor() {
        if (!lastCapturedDataUrl) return;
        scanView.innerHTML = "";
        scanView.appendChild(el('<div class="bw-scan-spinner"><div class="bw-spin"></div><div>Mencocokkan warna kulit…</div></div>'));
        api("/api/widget/color-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: lastCapturedDataUrl, sessionId: state.sessionId }),
        })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data.error) {
              renderColorError(data.message || "Tidak bisa membaca warna kulit dari foto ini.");
              return;
            }
            renderColorResult(data);
          })
          .catch(function () {
            renderColorError("Tidak bisa terhubung ke server analisis warna.");
          });
      }

      function analyzeFrame(dataUrl) {
        lastCapturedDataUrl = dataUrl;
        scanView.innerHTML = "";
        scanView.appendChild(el('<div class="bw-scan-spinner"><div class="bw-spin"></div><div>Menganalisis kulit…</div></div>'));
        api("/api/widget/scan-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: dataUrl, sessionId: state.sessionId }),
        })
          .then(function (res) { return res.json(); })
          .then(function (report) {
            if (report.error) {
              var messages = {
                no_face: "Wajah tidak terdeteksi. Pastikan wajahmu terlihat jelas di kamera.",
                face_too_small: "Wajah terlalu kecil di frame. Dekatkan sedikit ke kamera.",
                no_skin: "Area kulit tidak terdeteksi cukup jelas.",
                too_dark: "Pencahayaan terlalu gelap. Coba di tempat yang lebih terang.",
                too_blurry: "Gambar buram. Pastikan kamera stabil lalu coba lagi.",
              };
              renderScanError(messages[report.error] || report.message || "Analisis gagal, coba lagi ya.");
              return;
            }
            stopCamera();
            renderScanResult(report);
          })
          .catch(function () {
            renderScanError("Tidak bisa terhubung ke server analisis. Coba lagi sebentar lagi.");
          });
      }

      function renderScanCamera() {
        scanView.innerHTML = "";
        var video = el('<video class="bw-video" autoplay playsinline muted></video>');
        scanView.appendChild(video);
        var actions = el('<div class="bw-scan-actions"></div>');
        var capture = el('<button class="bw-btn-primary">Ambil Foto</button>');
        var back = el('<button class="bw-btn-ghost">Batal</button>');
        actions.appendChild(capture);
        actions.appendChild(back);
        scanView.appendChild(actions);
        scanView.appendChild(el('<div class="bw-scan-note">Foto diproses oleh model analisis kulit asli (MediaPipe + OpenCV), bukan simulasi.</div>'));

        back.addEventListener("click", showChatView);
        capture.addEventListener("click", function () {
          var w = video.videoWidth || 480;
          var h = video.videoHeight || 640;
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(video, 0, 0, w, h);
          var dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          analyzeFrame(dataUrl);
        });

        navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
          .then(function (stream) {
            cameraStream = stream;
            video.srcObject = stream;
          })
          .catch(function () {
            renderScanError("Tidak bisa mengakses kamera. Izinkan akses kamera di browser lalu coba lagi.");
          });
      }

      function openScanView() {
        body.hidden = true;
        footEl.hidden = true;
        scanView.hidden = false;
        renderScanCamera();
      }

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
      function closePanel() { panel.hidden = true; stopCamera(); }
      launcher.addEventListener("click", function () { panel.hidden = !panel.hidden; });
      closeBtn.addEventListener("click", closePanel);
      scanBtn.addEventListener("click", openScanView);

      addBotText(state.config.greeting || "Hai! Ada yang bisa aku bantu?");

      // Public API, same shape as Ganes' window.GanesWidget.
      window.BeautyWidget = {
        open: openPanel,
        close: closePanel,
        toggle: function () { panel.hidden = !panel.hidden; },
        ask: function (text) { openPanel(); send(text); },
        send: send,
        reset: function () {
          showChatView();
          state.conversationId = null;
          storageSet(CONVO_KEY, "");
          body.innerHTML = "";
          addBotText(state.config.greeting || "Hai! Ada yang bisa aku bantu?");
        },
        scan: openScanView,
      };
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
