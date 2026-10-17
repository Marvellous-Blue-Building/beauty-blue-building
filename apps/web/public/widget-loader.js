/*!
 * Beauty Advisor embeddable widget — loader + Shadow DOM mount.
 * Pattern borrowed from a colleague's separate "Ganes" widget (script tag →
 * Shadow DOM → SSE chat, origin-gated), stripped of multi-tenancy: single
 * backend per deployment, no data-store-id/org scoping.
 *
 * The beauty scan reads colour season, face shape and skin type from ONE
 * hands-free scan in three poses: facing the camera, turned right, turned
 * left (each cheek is read from the side photo facing it). The same live
 * checks as the app's /scan guide each pose — the MediaPipe face mesh, loaded
 * on demand from jsDelivr like /scan does — and /api/widget/beauty-analyze
 * reads the photos and saves the result for the chat to use. Where the mesh
 * can't load, each pose falls back to a timed capture and the server
 * re-checks the turn.
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

  // Scan pacing — slow enough to feel deliberate, short enough to hold still for.
  var CHECK_MS = 120;
  var POSES = ["front", "right", "left"];
  // A pose is taken once its checks have held this many ticks (~1.2 s facing
  // the camera, ~0.8 s turned — a turned head is harder to hold, and the side
  // photo needs only one sharp frame).
  var HOLD_TICKS = { front: 10, right: 7, left: 7 };
  // Frames kept while holding: a burst facing the camera (colour and face
  // shape read several), a few per side (the server uses the sharpest).
  var BURST = { front: 8, right: 3, left: 3 };
  var MANUAL_BURST = { front: 6, right: 1, left: 1 };
  var MANUAL_BURST_GAP_MS = 90;
  var FALLBACK_READY_TICKS = 8; // no face mesh: ~1 s of good light before the countdown
  var COUNTDOWN_MS = 650;
  var SIDE_LEAD_MS = 1500; // no face mesh: time to turn before a side countdown
  var CAPTURED_MS = 1500; // how long the "photo saved" moment shows
  var FRAME_MAX_SIDE = 960;
  // Offer the manual shutter when a pose isn't taken by then.
  var MANUAL_AFTER_MS = { front: 6000, right: 5000, left: 5000 };
  var TRACKER_LOAD_MS = 9000; // give up on the face mesh after this and scan without it

  // MediaPipe face mesh — the same version and model as the app's /scan
  // (apps/web/lib/scan/face-landmarker.ts).
  var MEDIAPIPE_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1";
  var LANDMARKER_MODEL =
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

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

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  var trackerPromise = null;
  /** The live face mesh, loaded once per page; resolves to null when it can't
   * load (a blocked CDN, an old browser) and the scan runs without it. */
  function loadTracker() {
    if (trackerPromise) return trackerPromise;
    trackerPromise = import(MEDIAPIPE_BASE + "/vision_bundle.mjs")
      .then(function (mp) {
        return mp.FilesetResolver.forVisionTasks(MEDIAPIPE_BASE + "/wasm").then(function (fileset) {
          function create(delegate) {
            return mp.FaceLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: LANDMARKER_MODEL, delegate: delegate },
              runningMode: "VIDEO",
              numFaces: 1,
              // Expression scores, so the front photo waits for a neutral face.
              outputFaceBlendshapes: true,
            });
          }
          return create("GPU").catch(function () { return create("CPU"); });
        });
      })
      .catch(function () {
        trackerPromise = null; // let a later scan retry
        return null;
      });
    return trackerPromise;
  }

  // ---- The three poses' limits, as in the app's apps/web/lib/scan/pose-steps.ts
  // (this is its plain-JS copy). Facing the camera: the server's face-shape
  // gates, so a front frame the camera takes is one the face shape can read.
  // Turned: 20°-60°, a natural turn (the server accepts 15°-70°), no nod check.
  var POSE_DIR = { front: 0, right: 1, left: -1 };
  var FRONT_MAX_YAW = 10, FRONT_MAX_ASYMMETRY = 0.18, FRONT_MAX_ROLL = 10, FRONT_PITCH_WINDOW = 20;
  // Expression: the server's relaxed-tier limits, so only a clear smile, open
  // mouth or raised brows holds the photo (natural brows can't be relaxed away).
  var MAX_MOUTH_OPEN = 0.05, MAX_JAW_OPEN = 0.25, MAX_SMILE = 0.5, MAX_BROW_RAISE = 0.75;
  var SIDE_MIN_YAW = 20, SIDE_MAX_YAW = 60, SIDE_MAX_ROLL = 20;
  var PITCH_NEUTRAL = 18; // a level head reads ~18° on this mesh

  function degrees(opposite, adjacent) {
    return adjacent <= 1e-6 ? 90 : Math.atan2(opposite, adjacent) * 180 / Math.PI;
  }

  /** Signed yaw (+ = the user's own right), pitch from level, and roll, from
   * the raw landmarks — size from the face edges' depth, direction from where
   * the nose sits between them. */
  function headTurn(p, heightOverWidth) {
    if (!p || p.length < 468) return null;
    var span = Math.abs(p[454].x - p[234].x);
    var height = Math.abs(p[152].y - p[10].y) * heightOverWidth;
    if (span <= 1e-5 || height <= 1e-5) return null;
    var toRight = Math.abs(p[1].x - p[234].x), toLeft = Math.abs(p[454].x - p[1].x);
    var offset = (toLeft - toRight) / (toLeft + toRight);
    var size = degrees(Math.abs(p[454].z - p[234].z), span);
    if (size < 0.5) size = Math.asin(Math.min(1, Math.abs(offset))) * 180 / Math.PI;
    var ex = p[263].x - p[33].x, ey = (p[263].y - p[33].y) * heightOverWidth;
    return {
      yaw: offset >= 0 ? size : -size,
      pitch: degrees(p[152].z - p[10].z, height) - PITCH_NEUTRAL, // negative = chin raised
      roll: Math.atan2(Math.abs(ey), Math.abs(ex)) * 180 / Math.PI,
      asymmetry: Math.abs(offset),
      mouthGap: Math.abs(p[14].y - p[13].y) / Math.abs(p[152].y - p[10].y),
    };
  }

  /** MediaPipe's expression scores by name, or null without them. */
  function blendshapes(result) {
    var cats = result.faceBlendshapes && result.faceBlendshapes[0] && result.faceBlendshapes[0].categories;
    if (!cats || !cats.length) return null;
    var out = {};
    cats.forEach(function (c) { out[c.categoryName] = c.score; });
    return out;
  }

  /** What the head (and, facing the camera, the expression) still needs for
   * this pose; "ok" when it is right. Blinks are left to the server. */
  function poseHint(pose, turn, face) {
    var dir = POSE_DIR[pose];
    if (!turn) return dir === 0 ? "lookStraight" : dir > 0 ? "turnRight" : "turnLeft";
    if (dir === 0) {
      if (Math.abs(turn.yaw) > FRONT_MAX_YAW || turn.asymmetry > FRONT_MAX_ASYMMETRY) return "lookStraight";
      if (turn.roll > FRONT_MAX_ROLL) return "levelHead";
      if (turn.pitch < -FRONT_PITCH_WINDOW) return "chinDown";
      if (turn.pitch > FRONT_PITCH_WINDOW) return "chinUp";
      if (turn.mouthGap > MAX_MOUTH_OPEN || (face && (face.jawOpen || 0) > MAX_JAW_OPEN)) return "closeMouth";
      if (face) {
        var smile = 0.5 * ((face.mouthSmileLeft || 0) + (face.mouthSmileRight || 0));
        var brows = Math.max(face.browInnerUp || 0, 0.5 * ((face.browOuterUpLeft || 0) + (face.browOuterUpRight || 0)));
        if (smile > MAX_SMILE || brows > MAX_BROW_RAISE) return "relaxFace";
      }
      return "ok";
    }
    var turned = turn.yaw * dir;
    if (turned < SIDE_MIN_YAW) return dir > 0 ? "turnRight" : "turnLeft";
    if (turned > SIDE_MAX_YAW) return "turnLess";
    if (turn.roll > SIDE_MAX_ROLL) return "levelHead";
    return "ok";
  }

  /** Face height 34-80% of the view, centred (looser for the side photos). */
  function framing(pose, box) {
    if (!box) return "noface";
    var side = pose !== "front";
    var height = box.y1 - box.y0;
    if (height < 0.34) return "far";
    if (height > (side ? 0.85 : 0.8)) return "close";
    var tolerance = side ? 0.24 : 0.14;
    if (Math.abs((box.x0 + box.x1) / 2 - 0.5) > tolerance) return "centre";
    if (Math.abs((box.y0 + box.y1) / 2 - 0.5) > tolerance + 0.06) return "centre";
    return "ok";
  }

  /** The scan stage's shape (width / height): 4:5, roomy enough for the
   * instructions to sit on the picture without pushing them below the fold. */
  var STAGE_ASPECT = 4 / 5;

  /** The part of the video the stage's `object-fit: cover` shows. */
  function coverCrop(vw, vh) {
    if (vw / vh > STAGE_ASPECT) {
      var w = (vh * STAGE_ASPECT) / vw;
      return { x: (1 - w) / 2, y: 0, w: w, h: 1 };
    }
    var h = vw / STAGE_ASPECT / vh;
    return { x: 0, y: (1 - h) / 2, w: 1, h: h };
  }

  // ---- Scan artwork: the face shape's outline (the same as the app's
  // apps/web/components/scan/BeautyIcons.tsx), line icons, the guide's
  // portraits, and the season's own colours.
  var FACE_SHAPE_PATH = {
    oval: "M12 2.5c4 0 7 4.2 7 9.5s-3 9.5-7 9.5-7-4.2-7-9.5 3-9.5 7-9.5z",
    round: "M12 3.2c4.8 0 8.4 3.9 8.4 8.8S16.8 20.8 12 20.8 3.6 16.9 3.6 12 7.2 3.2 12 3.2z",
    square: "M5.4 6c0-2.2 2.2-3.3 6.6-3.3s6.6 1.1 6.6 3.3v9.2c0 2.6-1.5 4.6-3.6 5.6H9c-2.1-1-3.6-3-3.6-5.6z",
    long: "M12 1.6c3.2 0 5.4 2.4 5.4 5.6v9.6c0 3.4-2.3 5.6-5.4 5.6s-5.4-2.2-5.4-5.6V7.2c0-3.2 2.2-5.6 5.4-5.6z",
    heart: "M4.4 7.6C4.4 4.4 7.6 2.8 12 2.8s7.6 1.6 7.6 4.8c0 5.6-4 10.9-7.6 13.6C8.4 18.5 4.4 13.2 4.4 7.6z",
    diamond: "M12 2.4c2.1 0 3.6 1.7 4.7 4.2l2.9 5.2c-1.6 4.2-4.4 7.9-7.6 9.8-3.2-1.9-6-5.6-7.6-9.8l2.9-5.2C8.4 4.1 9.9 2.4 12 2.4z",
    triangle: "M9 2.8h6l3.6 11.4c.8 2.9-.4 5.6-3 6.6-1.1.4-2.3.6-3.6.6s-2.5-.2-3.6-.6c-2.6-1-3.8-3.7-3-6.6z",
  };

  function svgOpen(size) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true">';
  }

  function faceShapeIcon(shape, size, draw) {
    var d = FACE_SHAPE_PATH[shape] || FACE_SHAPE_PATH.oval;
    return svgOpen(size) +
      '<path d="' + d + '" pathLength="1"' + (draw ? ' class="bw-draw"' : "") +
      ' fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>' +
      '<circle cx="9.6" cy="11" r=".9" fill="currentColor" opacity=".55"/><circle cx="14.4" cy="11" r=".9" fill="currentColor" opacity=".55"/>' +
      '<path d="M10.4 15.6c1 .7 2.2.7 3.2 0" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" opacity=".55"/></svg>';
  }

  function lineIcon(size, body) {
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>";
  }

  var ICON = {
    light: lineIcon(18, '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>'),
    glasses: lineIcon(18, '<circle cx="6.8" cy="14" r="3.4"/><circle cx="17.2" cy="14" r="3.4"/><path d="M10.2 14h3.6M3.6 12.8 2.6 9.6M20.4 12.8l1-3.2M4 4.5l16 15"/>'),
    hair: lineIcon(18, '<path d="M6.4 20.5C4.8 18.6 4 16 4 13 4 7.6 7.6 3.5 12 3.5s8 4.1 8 9.5c0 3-.8 5.6-2.4 7.5"/><path d="M8.2 12.6c.3 3.7 1.8 6 3.8 6s3.5-2.3 3.8-6"/><path d="M7.6 11.6c2.8-.2 5.4-1.8 6.9-4.1.8 1.8 1.9 3.2 3.4 4"/>'),
    lock: lineIcon(14, '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
    check: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    palette: lineIcon(24, '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.7-1 1.2-1.9-.5-1-.1-2.3 1.2-2.3H17a4 4 0 0 0 4-4c0-5.4-4-9.8-9-9.8z"/><circle cx="7.6" cy="11" r="1.1"/><circle cx="10.4" cy="7.3" r="1.1"/><circle cx="15" cy="7.7" r="1.1"/>'),
    alert: lineIcon(24, '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.1"/>'),
  };

  /** A small flat portrait for the guide: facing the camera, or turned to her
   * right (dir 1) or left (-1) the way the mirrored preview will show it. */
  function boothArt(dir) {
    var d = dir * 6; // features slide toward the turn
    var cx = 30 + dir * 2.6;
    var rx = 14 - Math.abs(dir) * 1.8;
    var near = 2.9, far = 2.9 - Math.abs(dir) * 1.1; // the far eye narrows
    var eyes = [[24.8 + d, dir > 0 ? near : far], [35.2 + d, dir > 0 ? far : near]];
    var l = cx - rx - 0.6, r = cx + rx + 0.6;
    function f(n) { return n.toFixed(1); }
    // A side-swept fringe, parted toward the turn.
    var part = cx + (dir || 1) * 3;
    var out = '<svg viewBox="0 0 60 80" aria-hidden="true">' +
      '<path class="cloth" d="M2 80c2-11 13-16.5 28-16.5S56 69 58 80z"/>' +
      '<path fill="#D29E82" d="M25 51h10v13c-3 2-7 2-10 0z"/>' +
      '<ellipse fill="#3A2630" cx="' + f(30 - dir * 0.8) + '" cy="35.5" rx="18.6" ry="22.5"/>' +
      '<ellipse fill="#EFC6AA" cx="' + f(cx) + '" cy="38.5" rx="' + f(rx) + '" ry="18"/>' +
      '<path fill="#3A2630" d="M' + f(l) + ' 39C' + f(l - 1) + ' 14 ' + f(r + 1) + ' 11 ' + f(r) + ' 35C' + f(r - 2) + ' 27 ' + f(part + 4) + ' 22.5 ' + f(part) + ' 23.5' +
        'C' + f(part - 7) + ' 25 ' + f(l + 2) + ' 30 ' + f(l) + ' 39z"/>';
    eyes.forEach(function (e) {
      out += '<ellipse cx="' + f(e[0]) + '" cy="39.4" rx="' + f(e[1] * 0.78) + '" ry="1.25" fill="#3A2630"/>' +
        '<path d="M' + f(e[0] - e[1]) + ' 38.9q' + f(e[1]) + ' -1.9 ' + f(2 * e[1]) + ' 0" fill="none" stroke="#3A2630" stroke-width=".9" stroke-linecap="round"/>' +
        '<path d="M' + f(e[0] - e[1] - 0.5) + ' 35.2q' + f(e[1] + 0.5) + ' -1.6 ' + f(2 * e[1] + 1) + ' -.2" fill="none" stroke="#3A2630" stroke-width="1.1" stroke-linecap="round" opacity=".85"/>' +
        '<circle cx="' + f(e[0] - 0.4) + '" cy="45.2" r="' + f(1.4 + e[1] * 0.6) + '" fill="#E8908F" opacity=".33"/>';
    });
    out += '<path d="M' + f(30 + d + dir * 0.4) + ' 40.6q' + f(dir ? dir * 2.8 : -1.5) + ' 4.3 ' + f(dir ? -dir * 0.4 : 0.8) + ' 5.5" fill="none" stroke="#B9806A" stroke-width="1.2" stroke-linecap="round"/>' +
      '<path fill="#C55E6E" d="M' + f(26.4 + d) + ' 50.6q3.6-2.2 7.2 0q-3.6 3.2-7.2 0z"/></svg>';
    return out;
  }

  /** Overlapping palette dots, like swatches fanned on a counter. */
  function fanEl(hexes) {
    var fan = document.createElement("div");
    fan.className = "bw-fan";
    hexes.forEach(function (hex) {
      var dot = document.createElement("i");
      dot.style.background = hex;
      fan.appendChild(dot);
    });
    return fan;
  }

  /** Her measured skin colour as a small lit sphere. */
  function skinEl(hex) {
    var dot = document.createElement("i");
    dot.className = "bw-skin";
    if (hex) dot.style.setProperty("--c", hex);
    return dot;
  }

  /** A face outline with dashed width and height lines — the proportions read. */
  var MEASURE_ART = '<svg viewBox="0 0 40 40" width="38" height="38" fill="none" stroke="currentColor" aria-hidden="true">' +
    '<path d="M20 5c6 0 10 6.5 10 15s-4 15-10 15-10-6.5-10-15S14 5 20 5z" stroke-width="1.8" fill="currentColor" fill-opacity=".1"/>' +
    '<path d="M20 2v36M6 17h28" stroke-width="1" stroke-dasharray="2 2.4" opacity=".75"/></svg>';

  /** Up to `n` colours from the season's palette, one per category first —
   * lipstick, blush, eyeshadow, highlighter, eyeliner, brows — then seconds. */
  function paletteHexes(colour, n) {
    var cats = (colour && colour.palette && colour.palette.categories) || [];
    var order = ["lip", "blush", "eyeshadow", "highlighter", "eyeliner", "brow"];
    var byId = {};
    cats.forEach(function (c) { byId[c.id] = c.swatches || []; });
    var out = [];
    for (var round = 0; round < 3 && out.length < n; round++) {
      order.forEach(function (id) {
        var sw = (byId[id] || [])[round];
        if (sw && /^#[0-9a-fA-F]{6}$/.test(sw.hex) && out.length < n) out.push(sw);
      });
    }
    return out;
  }

  // Phase 2 attribution (Lapis 1): read the retailer page's own `?promo=`
  // param, same idea as a UTM campaign tag, and send it once when the
  // session is first created.
  function getPromoCodeFromUrl() {
    try {
      return new URLSearchParams(window.location.search).get("promo") || null;
    } catch (e) {
      return null;
    }
  }

  function ensureSession() {
    var existing = storageGet(SESSION_KEY);
    if (existing) return Promise.resolve(existing);
    return api("/api/widget/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promoCode: getPromoCodeFromUrl() }),
    })
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
      ":host{--bw-primary:" + (cfg.color || "#7A4259") + ";--bw-ink:#241F26;--bw-paper:#FAF6F3;--bw-line:rgba(36,31,38,.12);" +
      "--bw-soft:#F3ECE6;--bw-muted:rgba(36,31,38,.6);--bw-faint:rgba(36,31,38,.4);--bw-ok:#2F8A5F;--bw-warn:#B7791F;" +
      // The app's own display face (apps/web/app/globals.css), falling back to the system serif.
      "--bw-serif:'Canela Text','GT Sectra','Iowan Old Style','Palatino Linotype',Palatino,Georgia,serif;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;}" +
      ".bw-launcher{position:fixed;" + (cfg.position === "bl" ? "left:20px;" : "right:20px;") + "bottom:20px;width:58px;height:58px;" +
      "border-radius:50%;border:none;cursor:pointer;background:var(--bw-primary);color:#fff;display:flex;" +
      "align-items:center;justify-content:center;box-shadow:0 10px 24px -8px rgba(0,0,0,.35);z-index:2147483000;}" +
      ".bw-launcher svg{width:26px;height:26px;}" +
      ".bw-panel{position:fixed;" + (cfg.position === "bl" ? "left:20px;" : "right:20px;") + "bottom:88px;width:320px;max-width:calc(100vw - 40px);" +
      "height:460px;max-height:calc(100vh - 120px);background:#fff;border:1px solid var(--bw-line);border-radius:16px;" +
      "box-shadow:0 24px 48px -20px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden;z-index:2147483000;" +
      "transition:width .25s ease,height .25s ease;}" +
      ".bw-panel.bw-wide{width:384px;height:660px;}" +
      ".bw-panel[hidden]{display:none;}" +
      ".bw-head{display:flex;align-items:center;gap:10px;padding:13px 14px;background:var(--bw-primary);color:#fff;flex:none;}" +
      ".bw-avatar{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.22);display:flex;" +
      "align-items:center;justify-content:center;font-weight:700;font-size:13px;flex:none;}" +
      ".bw-head .bw-name{font-weight:700;font-size:13.5px;}" +
      ".bw-head .bw-status{font-size:10.5px;opacity:.85;}" +
      ".bw-head button{margin-left:auto;background:none;border:none;color:#fff;opacity:.85;cursor:pointer;}" +
      ".bw-head .bw-scanbtn{margin-left:auto;display:flex;align-items:center;gap:5px;font-size:11px;font-weight:600;font-family:inherit;" +
      "background:rgba(255,255,255,.18);border-radius:999px;padding:5px 10px;opacity:1;}" +
      ".bw-head .bw-scanbtn + button{margin-left:4px;font-size:20px;line-height:1;}" +
      ".bw-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;font-size:13px;color:var(--bw-ink);}" +
      ".bw-row{display:flex;}" +
      ".bw-row.user{justify-content:flex-end;}" +
      ".bw-bubble{max-width:84%;padding:9px 12px;border-radius:13px;line-height:1.48;}" +
      ".bw-row.bot .bw-bubble{background:var(--bw-soft);border-bottom-left-radius:4px;}" +
      ".bw-row.user .bw-bubble{background:var(--bw-primary);color:#fff;border-bottom-right-radius:4px;}" +
      ".bw-card{display:flex;gap:9px;border:1px solid var(--bw-line);border-radius:11px;padding:8px;background:#fff;margin-top:6px;}" +
      ".bw-card .bw-ic{width:36px;height:36px;border-radius:8px;flex:none;background:var(--bw-soft);" +
      "display:flex;align-items:center;justify-content:center;font-size:16px;}" +
      ".bw-card .bw-meta{min-width:0;}" +
      ".bw-card .bw-brand{font-size:10px;text-transform:uppercase;letter-spacing:.05em;opacity:.6;}" +
      ".bw-card .bw-pname{font-size:12px;font-weight:600;line-height:1.3;margin:1px 0 3px;}" +
      ".bw-card .bw-price{font-size:11px;font-weight:600;}" +
      ".bw-chips{display:flex;flex-wrap:wrap;gap:6px;}" +
      ".bw-chips button{border:1px solid var(--bw-primary);color:var(--bw-primary);background:#fff;border-radius:999px;" +
      "padding:6px 11px;font-size:11.5px;font-family:inherit;cursor:pointer;}" +
      ".bw-chips button:hover{background:var(--bw-soft);}" +
      ".bw-foot{border-top:1px solid var(--bw-line);padding:9px 10px;display:flex;gap:7px;flex:none;}" +
      ".bw-foot[hidden],.bw-body[hidden]{display:none;}" +
      ".bw-foot input{flex:1;min-width:0;border:1px solid var(--bw-line);border-radius:999px;padding:8px 13px;font-size:12.5px;" +
      "font-family:inherit;color:var(--bw-ink);}" +
      ".bw-foot button{width:34px;height:34px;border-radius:50%;border:none;background:var(--bw-primary);color:#fff;" +
      "display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;}" +
      ".bw-typing{display:flex;gap:4px;padding:9px 12px;background:var(--bw-soft);border-radius:13px;width:fit-content;border-bottom-left-radius:4px;}" +
      ".bw-typing span{width:5px;height:5px;border-radius:50%;background:#999;display:inline-block;animation:bwb 1.1s infinite ease-in-out;}" +
      ".bw-typing span:nth-child(2){animation-delay:.15s;}.bw-typing span:nth-child(3){animation-delay:.3s;}" +
      "@keyframes bwb{0%,80%,100%{transform:translateY(0);opacity:.35;}40%{transform:translateY(-3px);opacity:.9;}}" +

      // ---- scan view: warm and personal — the brand colour, the serif, her own
      // photos and colours, and live guides on the camera
      ".bw-scanview{flex:1;display:flex;flex-direction:column;min-height:0;color:var(--bw-ink);background:var(--bw-paper);}" +
      ".bw-scanview[hidden]{display:none;}" +
      ".bw-scroll{flex:1;overflow-y:auto;padding:16px 16px 22px;display:flex;flex-direction:column;min-height:0;}" +
      ".bw-scroll > *{flex:none;}" +
      ".bw-actions{flex:none;display:flex;gap:8px;padding:12px 16px 14px;border-top:1px solid var(--bw-line);background:#fff;}" +
      ".bw-btn-primary{flex:1;background:var(--bw-primary);color:#fff;border:0;border-radius:999px;padding:12px 16px;font-size:13px;font-weight:600;" +
      "cursor:pointer;font-family:inherit;box-shadow:0 10px 20px -12px var(--bw-primary);transition:transform .15s ease,filter .15s ease;}" +
      ".bw-btn-ghost{flex:1;background:#fff;border:1px solid var(--bw-line);border-radius:999px;padding:11px 16px;font-size:13px;cursor:pointer;color:var(--bw-ink);font-family:inherit;}" +
      ".bw-btn-primary:hover{filter:brightness(1.08);}.bw-btn-primary:active{transform:scale(.98);}.bw-btn-ghost:hover{border-color:rgba(36,31,38,.3);}" +
      ".bw-link{align-self:center;background:none;border:0;color:var(--bw-muted);font-size:12px;text-decoration:underline;text-underline-offset:3px;cursor:pointer;font-family:inherit;padding:6px;margin-top:4px;}" +
      ".bw-link[hidden]{display:none;}" +
      ".bw-label{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--bw-muted);margin:22px 0 0;}" +
      ".bw-kicker{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--bw-primary);}" +
      ".bw-title{font-family:var(--bw-serif);font-weight:400;font-size:25px;line-height:1.15;letter-spacing:-.01em;margin:6px 0 0;}" +
      ".bw-fine{display:flex;gap:9px;align-items:flex-start;font-size:11px;line-height:1.55;color:var(--bw-faint);margin:18px 0 0;}" +
      ".bw-fine svg{flex:none;margin-top:1px;}" +
      "@keyframes bwfadein{from{opacity:0;}to{opacity:1;}}" +
      "@keyframes bwfadeup{from{opacity:0;transform:translateY(8px);}}" +
      "@keyframes bwdraw{to{stroke-dashoffset:0;}}" +
      // shared visuals: palette fan, skin sphere, undertone disc
      ".bw-fan{display:flex;}" +
      ".bw-fan i{width:22px;height:22px;border-radius:50%;margin-left:-7px;box-shadow:0 0 0 2px #fff;}.bw-fan i:first-child{margin-left:0;}" +
      ".bw-skin{display:block;width:28px;height:28px;border-radius:50%;flex:none;" +
      "background:radial-gradient(circle at 34% 30%,rgba(255,255,255,.75),rgba(255,255,255,0) 40%),var(--c,#E2B190);" +
      "box-shadow:inset 0 -3px 6px rgba(0,0,0,.14),0 0 0 2px #fff;}" +
      ".bw-tone{display:block;width:28px;height:28px;border-radius:50%;flex:none;box-shadow:0 0 0 2px #fff;background:linear-gradient(135deg,#E8D2C4,#C9AFA9);}" +
      ".bw-tone.warm{background:linear-gradient(135deg,#F6D791,#E3956A);}.bw-tone.cool{background:linear-gradient(135deg,#DCCBF0,#E3A6C0);}" +
      // guide
      ".bw-hero{border-radius:20px;padding:20px 16px 16px;color:#fff;overflow:hidden;" +
      "background:radial-gradient(90% 70% at 100% 0%,rgba(255,190,160,.42),rgba(255,190,160,0) 62%)," +
      "linear-gradient(165deg,var(--bw-primary),color-mix(in srgb,var(--bw-primary) 62%,#1C1218));}" +
      ".bw-hero .k{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;opacity:.72;}" +
      ".bw-hero h3{font-family:var(--bw-serif);font-weight:400;font-size:27px;line-height:1.1;letter-spacing:-.01em;margin:8px 0 0;}" +
      ".bw-hero h3 em{font-style:italic;color:#FFD5C2;}" +
      ".bw-booth{display:flex;gap:10px;margin-top:18px;}" +
      ".bw-booth figure{flex:1;margin:0;min-width:0;}" +
      ".bw-booth .f{position:relative;aspect-ratio:3/4;border-radius:999px 999px 12px 12px;overflow:hidden;background:#F6DCCF;animation:bwbooth 4.5s ease-in-out infinite;}" +
      ".bw-booth figure:nth-child(2) .f{background:#F3D2D4;animation-delay:1.5s;}.bw-booth figure:nth-child(3) .f{background:#EFD9C3;animation-delay:3s;}" +
      ".bw-booth svg{position:absolute;inset:0;width:100%;height:100%;}" +
      ".bw-booth .cloth{fill:var(--bw-primary);}" +
      ".bw-booth figcaption{display:flex;align-items:baseline;gap:6px;font-size:11.5px;margin-top:8px;white-space:nowrap;}" +
      ".bw-booth figcaption b{font-family:var(--bw-serif);font-weight:400;font-size:15px;color:#FFD5C2;}" +
      "@keyframes bwbooth{0%,38%,100%{transform:none;box-shadow:0 0 0 0 rgba(255,255,255,0);}" +
      "7%,30%{transform:translateY(-4px);box-shadow:0 0 0 2px #fff,0 12px 20px -8px rgba(0,0,0,.45);}}" +
      ".bw-gets{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;}" +
      ".bw-gets > div{border-radius:14px;padding:12px 10px 11px;background:color-mix(in srgb,var(--bw-primary) 9%,#fff);}" +
      ".bw-gets > div:nth-child(2){background:#FBE7DC;}.bw-gets > div:nth-child(3){background:#F3E8DC;}" +
      ".bw-gets .art{height:38px;display:flex;align-items:center;color:var(--bw-primary);}" +
      ".bw-gets b{display:block;font-size:12.5px;font-weight:600;margin-top:8px;}" +
      ".bw-gets small{display:block;font-size:10.5px;line-height:1.35;color:var(--bw-muted);margin-top:2px;}" +
      ".bw-tips{list-style:none;margin:6px 0 0;padding:0;}" +
      ".bw-tips li{display:flex;align-items:center;gap:12px;padding:9px 0;font-size:12.5px;line-height:1.45;}" +
      ".bw-tips li + li{border-top:1px solid var(--bw-line);}" +
      ".bw-tips svg{flex:none;width:32px;height:32px;padding:7px;border-radius:50%;background:#fff;color:var(--bw-primary);box-shadow:inset 0 0 0 1px var(--bw-line);}" +
      // camera
      ".bw-progress{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--bw-faint);}" +
      ".bw-progress .s{display:flex;align-items:center;gap:7px;white-space:nowrap;transition:color .2s ease;}" +
      ".bw-progress .s i{width:26px;height:32px;border-radius:999px 999px 7px 7px;background:#fff;box-shadow:inset 0 0 0 1px var(--bw-line);display:flex;" +
      "align-items:center;justify-content:center;font-style:normal;font-size:11px;font-weight:600;overflow:hidden;flex:none;transition:box-shadow .2s ease,background .2s ease;}" +
      ".bw-progress .s img{width:100%;height:100%;object-fit:cover;animation:bwdrop .5s cubic-bezier(.2,.9,.3,1.3) both;}" +
      ".bw-progress .s.now{color:var(--bw-ink);font-weight:600;}" +
      ".bw-progress .s.now i{background:var(--bw-primary);color:#fff;box-shadow:0 0 0 3px color-mix(in srgb,var(--bw-primary) 22%,#fff);}" +
      ".bw-progress .s.done{color:var(--bw-ink);}.bw-progress .s.done i{box-shadow:0 0 0 2px var(--bw-primary);}" +
      ".bw-progress .rule{flex:1;height:2px;border-radius:2px;background:var(--bw-line);overflow:hidden;}" +
      ".bw-progress .rule:after{content:'';display:block;height:100%;width:0;background:var(--bw-primary);transition:width .6s ease;}" +
      ".bw-progress .rule.on:after{width:100%;}" +
      "@keyframes bwdrop{from{opacity:0;transform:translateY(-12px) scale(1.6);}}" +
      ".bw-stage{position:relative;border-radius:20px;overflow:hidden;background:#1A1719;aspect-ratio:4/5;width:100%;flex:none;margin-top:14px;" +
      "box-shadow:0 0 0 0 rgba(155,235,192,0),0 18px 36px -22px rgba(36,31,38,.6);transition:box-shadow .3s ease;}" +
      ".bw-stage.good{box-shadow:0 0 0 3px #9BEBC0,0 18px 36px -20px rgba(47,138,95,.7);}" +
      ".bw-stage video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1);}" +
      ".bw-stage > svg{position:absolute;inset:0;width:100%;height:100%;}" +
      ".bw-oval{fill:none;stroke:rgba(255,255,255,.8);stroke-width:2;transition:stroke .25s ease;}" +
      ".bw-oval.ok{stroke:#9BEBC0;}" +
      ".bw-ring{fill:none;stroke:#fff;stroke-width:4;stroke-linecap:round;opacity:0;transition:stroke-dasharray .15s linear,opacity .2s ease;}" +
      ".bw-ticks line{stroke:#fff;stroke-width:2.4;stroke-linecap:round;opacity:.22;transition:opacity .15s ease,stroke .2s ease;}" +
      ".bw-ticks line.side{opacity:.5;stroke:#FFD2BF;}.bw-ticks line.lit{opacity:1;stroke:#FFB08E;}" +
      ".bw-ticks.ok line{stroke:#9BEBC0;opacity:1;}" +
      ".bw-ticks.far line.lit{stroke:#F2C77E;}" +
      ".bw-count{position:absolute;inset:0 0 25%;display:flex;align-items:center;justify-content:center;font-family:var(--bw-serif);font-size:72px;font-weight:300;color:#fff;pointer-events:none;}" +
      ".bw-count span{animation:bwcount .6s ease-out both;}" +
      "@keyframes bwcount{from{opacity:0;transform:scale(1.5);}to{opacity:1;transform:none;}}" +
      ".bw-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;}" +
      ".bw-flash.go{animation:bwflash .45s ease-out;}" +
      "@keyframes bwflash{0%{opacity:.75;}100%{opacity:0;}}" +
      ".bw-done{position:absolute;left:50%;top:40%;width:68px;height:68px;margin:-34px 0 0 -34px;opacity:0;pointer-events:none;}" +
      ".bw-done svg{width:100%;height:100%;}" +
      ".bw-done circle{fill:rgba(47,138,95,.55);stroke:#fff;stroke-width:2;}" +
      ".bw-done path{fill:none;stroke:#fff;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:40;stroke-dashoffset:40;}" +
      ".bw-done.go{animation:bwpop .5s cubic-bezier(.2,.9,.3,1.35) both;}.bw-done.go path{animation:bwdraw .4s .18s ease-out forwards;}" +
      "@keyframes bwpop{from{opacity:0;transform:scale(.55);}to{opacity:1;transform:none;}}" +
      ".bw-scrim{position:absolute;left:0;right:0;bottom:0;padding:52px 16px 12px;color:#fff;text-align:center;pointer-events:none;" +
      "background:linear-gradient(to top,rgba(22,15,20,.86),rgba(22,15,20,.55) 55%,rgba(22,15,20,0));}" +
      ".bw-cue{display:flex;align-items:center;justify-content:center;gap:10px;font-family:var(--bw-serif);font-size:21px;line-height:1.2;margin:0;min-height:26px;transition:color .2s ease;}" +
      ".bw-cue.good{color:#BDF3D6;}" +
      ".bw-cue-sub{font-size:11.5px;line-height:1.45;opacity:.8;margin:4px 0 0;min-height:17px;}" +
      ".bw-chev{display:inline-flex;gap:2px;}" +
      ".bw-chev[hidden]{display:none;}" +
      ".bw-chev i{width:8px;height:8px;border-right:2px solid currentColor;border-top:2px solid currentColor;transform:rotate(45deg);opacity:.25;animation:bwchev 1.1s ease-in-out infinite;}" +
      ".bw-chev i:nth-child(2){animation-delay:.15s;}.bw-chev i:nth-child(3){animation-delay:.3s;}" +
      ".bw-chev.l{flex-direction:row-reverse;}.bw-chev.l i{transform:rotate(-135deg);}" +
      "@keyframes bwchev{0%,100%{opacity:.25;}40%{opacity:1;}}" +
      ".bw-meter{width:74%;margin:10px auto 0;}" +
      ".bw-meter[hidden]{display:none;}" +
      ".bw-meter .track{position:relative;height:6px;border-radius:6px;background:rgba(255,255,255,.22);}" +
      ".bw-meter .zone{position:absolute;top:0;bottom:0;border-radius:6px;background:rgba(155,235,192,.5);}" +
      ".bw-meter .dot{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff;" +
      "box-shadow:0 0 0 3px rgba(255,255,255,.25);transition:left .12s linear,background .2s ease;}" +
      ".bw-meter.ok .dot{background:#9BEBC0;box-shadow:0 0 0 4px rgba(155,235,192,.35);}.bw-meter.far .dot{background:#F2C77E;}" +
      ".bw-meter .ends{position:relative;height:12px;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;opacity:.7;margin-top:6px;}" +
      ".bw-meter .ends span{position:absolute;top:0;transform:translateX(-50%);white-space:nowrap;}" +
      ".bw-scrim .bw-link{pointer-events:auto;color:#fff;opacity:.9;margin-top:4px;padding:4px 6px;}" +
      // analysing
      ".bw-wait{display:flex;flex-direction:column;align-items:center;text-align:center;padding-top:8px;}" +
      ".bw-fanph{position:relative;width:230px;height:150px;margin-bottom:22px;}" +
      ".bw-fanph:before{content:'';position:absolute;left:50%;top:50%;width:190px;height:190px;margin:-95px 0 0 -95px;border-radius:50%;" +
      "background:radial-gradient(color-mix(in srgb,var(--bw-primary) 24%,#fff),rgba(255,255,255,0) 68%);animation:bwbreathe 2.4s ease-in-out infinite;}" +
      "@keyframes bwbreathe{0%,100%{transform:scale(.9);opacity:.7;}50%{transform:scale(1.06);opacity:1;}}" +
      ".bw-fanph img{position:absolute;top:14px;left:50%;width:88px;height:116px;margin-left:-44px;object-fit:cover;border-radius:999px 999px 14px 14px;" +
      "border:3px solid #fff;box-shadow:0 14px 26px -14px rgba(36,31,38,.6);background:var(--bw-soft);animation:bwfadeup .5s ease-out both;}" +
      ".bw-fanph img.l{transform:translateX(-64px) rotate(-9deg);animation-delay:.08s;}" +
      ".bw-fanph img.c{z-index:1;top:4px;}" +
      ".bw-fanph img.r{transform:translateX(64px) rotate(9deg);animation-delay:.16s;}" +
      ".bw-run{height:4px;border-radius:4px;background:color-mix(in srgb,var(--bw-primary) 16%,#fff);overflow:hidden;margin-top:18px;position:relative;width:100%;}" +
      ".bw-run:after{content:'';position:absolute;top:0;bottom:0;width:36%;border-radius:4px;background:linear-gradient(90deg,#F3A88E,var(--bw-primary));animation:bwrun 1.4s ease-in-out infinite;}" +
      ".bw-run.full:after{left:0;width:100%;animation:none;transition:width .3s ease;}" +
      "@keyframes bwrun{from{left:-36%;}to{left:100%;}}" +
      ".bw-stepsl{list-style:none;margin:14px 0 0;padding:0;width:100%;text-align:left;}" +
      ".bw-stepsl li{display:flex;align-items:center;gap:12px;font-size:13px;padding:10px 2px;color:var(--bw-faint);transition:color .3s ease;}" +
      ".bw-stepsl li + li{border-top:1px solid var(--bw-line);}" +
      ".bw-stepsl i{width:22px;height:22px;border-radius:50%;flex:none;box-shadow:inset 0 0 0 1.5px var(--bw-line);display:flex;align-items:center;justify-content:center;color:#fff;}" +
      ".bw-stepsl i svg{opacity:0;transform:scale(.5);transition:opacity .2s ease,transform .25s cubic-bezier(.2,.9,.3,1.4);}" +
      ".bw-stepsl li.run,.bw-stepsl li.done{color:var(--bw-ink);}" +
      ".bw-stepsl li.run i{box-shadow:none;border:2px solid color-mix(in srgb,var(--bw-primary) 22%,#fff);border-top-color:var(--bw-primary);animation:bwspin .8s linear infinite;}" +
      ".bw-stepsl li.done i{background:var(--bw-primary);box-shadow:none;}.bw-stepsl li.done i svg{opacity:1;transform:none;}" +
      "@keyframes bwspin{to{transform:rotate(360deg);}}" +
      // results
      ".bw-rhero{border-radius:20px;padding:16px;background:color-mix(in srgb,var(--bw-primary) 10%,#fff);animation:bwfadeup .4s ease-out both;}" +
      ".bw-rhero .top{display:flex;gap:14px;align-items:center;}" +
      ".bw-rhero .ph{width:72px;height:92px;flex:none;border-radius:999px 999px 14px 14px;overflow:hidden;border:3px solid #fff;" +
      "box-shadow:0 12px 22px -12px rgba(36,31,38,.6);background:var(--bw-soft);}" +
      ".bw-rhero .ph img{display:block;width:100%;height:100%;object-fit:cover;}" +
      ".bw-rhero .k{font-size:10.5px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--bw-muted);}" +
      ".bw-rhero h3{font-family:var(--bw-serif);font-weight:400;font-size:31px;line-height:1.02;letter-spacing:-.015em;margin:6px 0 0;}" +
      ".bw-rhero .m{font-size:12px;color:var(--bw-muted);margin-top:7px;}" +
      ".bw-rhero .pal{display:flex;gap:5px;margin-top:14px;}" +
      ".bw-rhero .pal i{flex:1;height:36px;border-radius:10px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06);transform-origin:bottom;animation:bwrise .5s cubic-bezier(.2,.9,.3,1.25) both;}" +
      "@keyframes bwrise{from{opacity:0;transform:translateY(8px) scaleY(.5);}}" +
      ".bw-tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px;flex:none;}" +
      ".bw-tiles button{display:flex;flex-direction:column;align-items:flex-start;text-align:left;border:0;border-radius:14px;padding:11px 10px 10px;background:#fff;" +
      "box-shadow:inset 0 0 0 1px var(--bw-line);cursor:pointer;font-family:inherit;color:var(--bw-ink);min-width:0;transition:box-shadow .2s ease,transform .15s ease;}" +
      ".bw-tiles button:hover{transform:translateY(-1px);}" +
      ".bw-tiles button[aria-selected='true']{box-shadow:inset 0 0 0 2px var(--bw-primary),0 10px 20px -14px var(--bw-primary);}" +
      ".bw-tiles .art{height:30px;display:flex;align-items:center;color:var(--bw-primary);}" +
      ".bw-tiles .bw-fan i{width:20px;height:20px;}.bw-tiles .bw-skin{width:26px;height:26px;}" +
      ".bw-tiles .none{width:26px;height:26px;border-radius:50%;border:1.5px dashed var(--bw-faint);}" +
      ".bw-tiles small{font-size:9.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--bw-muted);margin-top:8px;}" +
      ".bw-tiles b{font-size:12.5px;font-weight:600;margin-top:2px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      ".bw-tiles b.off{color:var(--bw-faint);font-weight:400;}" +
      ".bw-tabpanel{display:flex;flex-direction:column;animation:bwfadeup .3s ease-out both;}" +
      ".bw-sec{background:#fff;border-radius:16px;padding:14px;margin-top:10px;box-shadow:inset 0 0 0 1px var(--bw-line);}" +
      ".bw-sec > h5{font-family:var(--bw-serif);font-weight:400;font-size:17px;line-height:1.25;margin:0 0 4px;}" +
      ".bw-text{font-size:13px;line-height:1.6;margin:8px 0 0;}" +
      ".bw-metaline{font-size:12px;color:var(--bw-muted);margin:6px 0 0;}" +
      ".bw-keys{display:flex;flex-wrap:wrap;gap:10px 18px;margin-top:14px;font-size:12px;}" +
      ".bw-keys > div{display:flex;align-items:center;gap:9px;}" +
      ".bw-scale{padding:10px 0 11px;}" +
      ".bw-scale + .bw-scale{border-top:1px solid var(--bw-line);}" +
      ".bw-scale .top{display:flex;justify-content:space-between;font-size:12.5px;}" +
      ".bw-scale .top b{font-weight:600;color:var(--bw-primary);}" +
      ".bw-scale .line{position:relative;height:8px;border-radius:8px;margin:11px 0 7px;" +
      "background:linear-gradient(90deg,color-mix(in srgb,var(--bw-primary) 14%,#fff),color-mix(in srgb,var(--bw-primary) 70%,#fff));}" +
      ".bw-scale .line i{position:absolute;top:50%;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#fff;" +
      "box-shadow:0 0 0 2px var(--bw-ink),0 4px 10px -3px rgba(0,0,0,.4);animation:bwslide .8s cubic-bezier(.2,.9,.3,1.1) both;}" +
      "@keyframes bwslide{from{left:50%;}}" +
      ".bw-scale .ends{display:flex;justify-content:space-between;font-size:10.5px;color:var(--bw-faint);}" +
      ".bw-scale.off{opacity:.5;}.bw-scale.off .line{background:var(--bw-soft);}" +
      ".bw-pal{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;font-size:12.5px;}" +
      ".bw-pal + .bw-pal{border-top:1px solid var(--bw-line);}" +
      ".bw-pal div{display:flex;gap:6px;}" +
      ".bw-pal i{width:24px;height:24px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08);transition:transform .15s ease;}" +
      ".bw-pal i:hover{transform:scale(1.18);}" +
      ".bw-shelf{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;scroll-padding:0 16px;margin:10px -16px 0;padding:2px 16px 6px;scrollbar-width:none;}" +
      ".bw-shelf::-webkit-scrollbar{display:none;}" +
      ".bw-pc{flex:none;width:128px;scroll-snap-align:start;background:#fff;border-radius:14px;overflow:hidden;box-shadow:inset 0 0 0 1px var(--bw-line);display:flex;flex-direction:column;}" +
      ".bw-pc .sw{position:relative;height:58px;}" +
      ".bw-pc .sw span{position:absolute;left:8px;bottom:8px;font-size:9.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;" +
      "background:rgba(255,255,255,.92);color:var(--bw-ink);padding:3px 7px;border-radius:999px;}" +
      ".bw-pc .tx{padding:9px 10px 10px;display:flex;flex-direction:column;flex:1;}" +
      ".bw-pc small{font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--bw-muted);}" +
      ".bw-pc .nm{font-size:12px;line-height:1.35;margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}" +
      ".bw-pc b{font-size:12.5px;font-weight:600;margin-top:auto;padding-top:6px;}" +
      ".bw-note{font-size:12.5px;line-height:1.55;background:color-mix(in srgb,var(--bw-primary) 8%,#fff);border-radius:12px;padding:10px 12px;margin:10px 0 0;}" +
      ".bw-note.warn{background:#FBEEDD;}" +
      ".bw-caveat{font-size:11px;line-height:1.55;color:var(--bw-faint);margin:14px 0 0;}" +
      ".bw-shapehero,.bw-skinhero{display:flex;align-items:center;gap:14px;}" +
      ".bw-shapehero .art{width:72px;height:72px;flex:none;border-radius:50%;background:color-mix(in srgb,var(--bw-primary) 11%,#fff);color:var(--bw-primary);" +
      "display:flex;align-items:center;justify-content:center;}" +
      ".bw-shapehero h4,.bw-skinhero h4{font-family:var(--bw-serif);font-weight:400;font-size:28px;line-height:1.05;letter-spacing:-.01em;margin:0;}" +
      ".bw-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:bwdraw 1.1s ease-out .1s forwards;}" +
      ".bw-look{display:grid;grid-template-columns:60px 1fr;gap:12px;padding:12px 0;}" +
      ".bw-look + .bw-look{border-top:1px solid var(--bw-line);}" +
      ".bw-look img{width:60px;height:76px;object-fit:cover;border-radius:10px;background:var(--bw-soft);}" +
      ".bw-look b{display:block;font-size:13px;font-weight:600;}" +
      ".bw-tier{display:inline-block;font-size:10.5px;font-weight:600;padding:3px 8px;border-radius:999px;margin-top:4px;background:var(--bw-soft);color:var(--bw-muted);}" +
      ".bw-tier.best{background:#E3F3EA;color:#2B7451;}.bw-tier.one_touch{background:#FBEBD5;color:#94601A;}" +
      ".bw-look p{margin:6px 0 0;font-size:12px;line-height:1.5;color:var(--bw-muted);}" +
      ".bw-dial{position:relative;width:76px;height:76px;flex:none;}" +
      ".bw-dial svg{width:100%;height:100%;transform:rotate(-90deg);}" +
      ".bw-dial circle{fill:none;stroke-width:7;}" +
      ".bw-dial .bg{stroke:color-mix(in srgb,var(--bw-primary) 14%,#fff);}" +
      ".bw-dial .arc{stroke:var(--bw-primary);stroke-linecap:round;animation:bwarc 1.1s ease-out both;}" +
      "@keyframes bwarc{from{stroke-dasharray:0 100;}}" +
      ".bw-dial div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}" +
      ".bw-dial b{font-family:var(--bw-serif);font-weight:400;font-size:24px;line-height:1;}" +
      ".bw-dial small{font-size:9.5px;color:var(--bw-muted);margin-top:2px;}" +
      ".bw-photos{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px;}" +
      ".bw-photos figure{position:relative;margin:0;border-radius:12px;overflow:hidden;background:var(--bw-soft);}" +
      ".bw-photos img{display:block;width:100%;aspect-ratio:3/4;object-fit:cover;}" +
      ".bw-photos .off img{opacity:.4;filter:grayscale(1);}" +
      ".bw-photos figcaption{position:absolute;left:0;right:0;bottom:0;padding:18px 7px 6px;font-size:10px;line-height:1.3;color:#fff;" +
      "background:linear-gradient(to top,rgba(20,14,18,.78),rgba(20,14,18,0));}" +
      ".bw-row2{display:flex;align-items:flex-start;gap:10px;padding:10px 0;font-size:12.5px;}" +
      ".bw-row2 + .bw-row2{border-top:1px solid var(--bw-line);}" +
      ".bw-row2 > i{width:8px;height:8px;border-radius:50%;margin-top:5px;flex:none;background:var(--bw-line);}" +
      ".bw-row2 > i.lo{background:#5BB98B;}.bw-row2 > i.mid{background:#E3A950;}.bw-row2 > i.hi{background:#D8687A;}" +
      ".bw-row2 > span{flex:1;}.bw-row2 > span:last-child{color:var(--bw-muted);text-align:right;}" +
      ".bw-row2 small{display:block;font-size:10.5px;color:var(--bw-faint);margin-top:2px;}" +
      ".bw-legend{display:flex;gap:14px;font-size:10.5px;color:var(--bw-muted);margin-top:4px;}" +
      ".bw-legend span{display:flex;align-items:center;gap:5px;}.bw-legend i{width:7px;height:7px;border-radius:50%;}" +
      ".bw-score{padding:9px 0;}" +
      ".bw-score .top{display:flex;justify-content:space-between;font-size:12.5px;}" +
      ".bw-score .top span:last-child{color:var(--bw-muted);font-variant-numeric:tabular-nums;}" +
      ".bw-score .bar{height:6px;border-radius:6px;background:color-mix(in srgb,var(--bw-primary) 10%,#fff);margin-top:7px;overflow:hidden;}" +
      ".bw-score .bar div{height:100%;border-radius:6px;background:linear-gradient(90deg,#F3A88E,var(--bw-primary));animation:bwgrow .9s ease-out both;}" +
      "@keyframes bwgrow{from{width:0;}}" +
      ".bw-retry,.bw-error{border-radius:18px;padding:18px 16px 16px;background:#FBEBDD;animation:bwfadeup .3s ease-out both;}" +
      ".bw-retry .ic,.bw-error .ic{width:46px;height:46px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;color:var(--bw-warn);margin-bottom:12px;}" +
      ".bw-retry h4,.bw-error h4{font-family:var(--bw-serif);font-weight:400;font-size:22px;line-height:1.2;margin:0;}" +
      ".bw-retry p,.bw-error p{font-size:13px;line-height:1.6;color:var(--bw-muted);margin:8px 0 0;}" +
      ".bw-retry .bw-label{margin-top:14px;}" +
      ".bw-retry ol{list-style:none;counter-reset:tip;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px;}" +
      ".bw-retry ol li{counter-increment:tip;display:flex;gap:10px;align-items:flex-start;font-size:12.5px;line-height:1.45;background:#fff;border-radius:12px;padding:10px 12px;}" +
      ".bw-retry ol li:before{content:counter(tip);flex:none;width:20px;height:20px;border-radius:50%;background:var(--bw-primary);color:#fff;" +
      "font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;}" +
      ".bw-retry .bw-btn-primary{margin-top:16px;width:100%;flex:none;}" +
      "@media (prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;animation-iteration-count:1!important;transition:none!important;}}"
    );
  };

  function el(html) {
    var d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function text(tag, cls, value) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = value;
    return node;
  }

  function safeHex(hex) {
    return typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : null;
  }

  function rupiah(n) {
    return n != null ? "Rp " + Number(n).toLocaleString("id-ID") : "";
  }

  var ERROR_TEXT = {
    no_face: ["Wajah belum terlihat", "Posisikan seluruh wajahmu di dalam oval, lalu scan lagi."],
    face_too_small: ["Wajah terlalu jauh", "Dekatkan sedikit ke kamera sampai wajah memenuhi oval."],
    no_skin: ["Kulit belum terbaca", "Pastikan wajah tidak tertutup rambut, masker atau tangan."],
    too_dark: ["Cahaya terlalu gelap", "Coba menghadap jendela atau lampu, lalu scan lagi."],
    too_blurry: ["Gambar buram", "Tahan kamera dan kepala tetap diam selama pemindaian."],
    frames_too_large: ["Foto terlalu besar", "Coba scan lagi."],
    service_unreachable: ["Server analisis sedang tidak aktif", "Coba lagi sebentar lagi ya."],
  };

  function mount() {
    var host = document.createElement("div");
    host.id = "bw-widget-host";
    document.body.appendChild(host);
    var shadow = host.attachShadow({ mode: "open" });

    var state = { sessionId: null, conversationId: storageGet(CONVO_KEY), config: null, lastScan: null };

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
            '<button class="bw-scanbtn" aria-label="Analisis kecantikan" title="Analisis warna, bentuk wajah & kulit">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="none"><path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><ellipse cx="12" cy="12" rx="3.6" ry="4.6" stroke="currentColor" stroke-width="1.6"/></svg>' +
              "<span>Scan</span>" +
            "</button>" +
            '<button aria-label="Tutup">&times;</button>' +
          "</div>" +
          '<div class="bw-body"></div>' +
          '<div class="bw-scanview" hidden></div>' +
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
      var footEl = panel.querySelector(".bw-foot");

      // ------------------------------------------------------------ scan view plumbing

      var scan = { stream: null, timer: null, timeouts: [] };

      function later(fn, ms) {
        var id = setTimeout(fn, ms);
        scan.timeouts.push(id);
        return id;
      }

      function stopCamera() {
        if (scan.timer) { clearInterval(scan.timer); scan.timer = null; }
        scan.timeouts.forEach(clearTimeout);
        scan.timeouts = [];
        if (scan.stream) {
          scan.stream.getTracks().forEach(function (t) { t.stop(); });
          scan.stream = null;
        }
      }

      /** Clears the scan view into a scrolling area plus an optional action bar. */
      function scanLayout(actions) {
        scanView.innerHTML = "";
        var scroll = text("div", "bw-scroll");
        scanView.appendChild(scroll);
        if (actions && actions.length) {
          var bar = text("div", "bw-actions");
          actions.forEach(function (a) {
            var b = text("button", a.primary ? "bw-btn-primary" : "bw-btn-ghost", a.label);
            b.addEventListener("click", a.onClick);
            bar.appendChild(b);
          });
          scanView.appendChild(bar);
        }
        return scroll;
      }

      function showChatView() {
        stopCamera();
        panel.classList.remove("bw-wide");
        scanView.hidden = true;
        body.hidden = false;
        footEl.hidden = false;
        body.scrollTop = body.scrollHeight;
      }

      function openScanView() {
        panel.hidden = false;
        panel.classList.add("bw-wide");
        body.hidden = true;
        footEl.hidden = true;
        scanView.hidden = false;
        renderGuide();
      }

      // ------------------------------------------------------------ 1. guidance

      // Sample colours for the guide's "what you get" palette.
      var SAMPLE_FAN = ["#C9566B", "#EE9A7B", "#8E4E6A", "#D9A65A", "#B88AA0"];

      function renderGuide() {
        stopCamera();
        var scroll = scanLayout([
          { label: "Mulai scan", primary: true, onClick: renderCamera },
          { label: "Nanti saja", onClick: showChatView },
        ]);
        var hero = text("div", "bw-hero");
        hero.appendChild(text("div", "k", "Analisis kecantikan"));
        var title = document.createElement("h3");
        title.appendChild(document.createTextNode("Tiga foto, "));
        title.appendChild(text("em", null, "satu profil"));
        title.appendChild(document.createTextNode(" kecantikan."));
        hero.appendChild(title);
        var booth = text("div", "bw-booth");
        [[0, "Hadap kamera"], [1, "Toleh kanan"], [-1, "Toleh kiri"]].forEach(function (b, i) {
          var fig = document.createElement("figure");
          var frame = text("div", "f");
          frame.innerHTML = boothArt(b[0]);
          fig.appendChild(frame);
          var cap = document.createElement("figcaption");
          cap.appendChild(text("b", null, String(i + 1)));
          cap.appendChild(document.createTextNode(b[1]));
          fig.appendChild(cap);
          booth.appendChild(fig);
        });
        hero.appendChild(booth);
        scroll.appendChild(hero);

        scroll.appendChild(text("div", "bw-label", "Yang kamu dapat"));
        var gets = text("div", "bw-gets");
        [
          [fanEl(SAMPLE_FAN), "Musim warna", "dan shade dari katalog"],
          [MEASURE_ART, "Bentuk wajah", "dan look yang cocok"],
          [skinEl(null), "Tipe kulit", "dibaca per area wajah"],
        ].forEach(function (g) {
          var tile = document.createElement("div");
          var art = text("div", "art");
          if (typeof g[0] === "string") art.innerHTML = g[0]; else art.appendChild(g[0]);
          tile.appendChild(art);
          tile.appendChild(text("b", null, g[1]));
          tile.appendChild(text("small", null, g[2]));
          gets.appendChild(tile);
        });
        scroll.appendChild(gets);

        scroll.appendChild(text("div", "bw-label", "Sebelum mulai"));
        var tips = text("ul", "bw-tips");
        [
          [ICON.light, "Cahaya dari depan — menghadap jendela atau lampu."],
          [ICON.glasses, "Lepas kacamata; makeup tipis saja."],
          [ICON.hair, "Biarkan sedikit rambut terlihat. Hijab tidak masalah."],
        ].forEach(function (tip) {
          var li = document.createElement("li");
          li.innerHTML = tip[0];
          li.appendChild(text("span", null, tip[1]));
          tips.appendChild(li);
        });
        scroll.appendChild(tips);
        var fine = text("p", "bw-fine");
        fine.innerHTML = ICON.lock;
        fine.appendChild(text("span", null,
          "Foto hanya dipakai untuk analisis dan tidak disimpan. Yang kami simpan hanya hasilnya, supaya saran di chat sesuai denganmu."));
        scroll.appendChild(fine);
        loadTracker(); // start fetching the face mesh while she reads
      }

      // ------------------------------------------------------------ 2. camera: three poses, hands-free

      var POSE_NAME = { front: "Depan", right: "Kanan", left: "Kiri" };
      var POSE_SUB = {
        front: "Foto 1 dari 3 · wajah lurus, ekspresi netral",
        right: "Foto 2 dari 3 · berhenti di zona hijau",
        left: "Foto 3 dari 3 · berhenti di zona hijau",
      };
      var POSE_NEXT = {
        front: "Selanjutnya, toleh pelan ke kanan.",
        right: "Selanjutnya, toleh pelan ke kiri.",
        left: "Selesai. Sedang menyiapkan hasilmu.",
      };

      var STATUS = {
        start: "Menyalakan kamera",
        loading: "Menyiapkan kamera",
        noface: "Masukkan wajahmu ke dalam oval",
        far: "Sedikit lebih dekat",
        close: "Sedikit lebih jauh",
        centre: "Geser ke tengah oval",
        dark: "Cari cahaya yang lebih terang",
        bright: "Cahayanya terlalu terang",
        uneven: "Hadapkan wajah ke arah cahaya",
        motion: "Tahan sebentar",
        lookStraight: "Lihat lurus ke kamera",
        levelHead: "Luruskan kepala",
        chinDown: "Turunkan dagu sedikit",
        chinUp: "Angkat dagu sedikit",
        closeMouth: "Tutup mulut sebentar",
        relaxFace: "Wajah rileks dulu",
        turnRight: "Toleh pelan ke kanan",
        turnLeft: "Toleh pelan ke kiri",
        turnLess: "Sedikit kembali",
        ready: "Bagus, tahan",
        readySide: "Bagus, tahan",
        capture: "Memotret",
      };
      var GOOD = { ready: true, readySide: true, capture: true };

      // The stage is 4:5 (STAGE_ASPECT); the oval sits in its 300x375 overlay,
      // and without the face mesh the light check samples it.
      var VIEW = { w: 300, h: 375 };
      var OVAL = { cx: 150, cy: 166, rx: 94, ry: 124 };
      var PROBE = { w: 48, h: 60 };
      var TICKS = 64;
      // The turn meter runs 0°-70°; its green zone is the side photo's 20°-60°.
      var METER_MAX_YAW = 70;

      function renderCamera() {
        stopCamera();
        var scroll = scanLayout([{ label: "Batal", onClick: renderGuide }]);
        var ovalPath = "M" + (OVAL.cx - OVAL.rx) + "," + OVAL.cy +
          " a" + OVAL.rx + "," + OVAL.ry + " 0 1,0 " + 2 * OVAL.rx + ",0 a" + OVAL.rx + "," + OVAL.ry + " 0 1,0 " + -2 * OVAL.rx + ",0Z";
        // The hold ring runs clockwise from the top of the oval.
        var ringPath = "M" + OVAL.cx + "," + (OVAL.cy - OVAL.ry) +
          " A" + OVAL.rx + "," + OVAL.ry + " 0 1,1 " + OVAL.cx + "," + (OVAL.cy + OVAL.ry) +
          " A" + OVAL.rx + "," + OVAL.ry + " 0 1,1 " + OVAL.cx + "," + (OVAL.cy - OVAL.ry);

        // A ring of fine ticks just outside the oval, like a phone's face
        // setup. On a side photo the ticks on that side light up from ear level
        // outward as she turns; all of them turn green once the pose is right.
        var tickMarkup = "";
        var tickInfo = [];
        for (var k = 0; k < TICKS; k++) {
          var t = (-90 + (k * 360) / TICKS) * Math.PI / 180;
          var ex = OVAL.rx + 12, ey = OVAL.ry + 12;
          var x = OVAL.cx + ex * Math.cos(t), y = OVAL.cy + ey * Math.sin(t);
          var nx = Math.cos(t) / ex, ny = Math.sin(t) / ey, nl = Math.sqrt(nx * nx + ny * ny);
          tickMarkup += '<line x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + (x + (7 * nx) / nl).toFixed(1) +
            '" y2="' + (y + (7 * ny) / nl).toFixed(1) + '"/>';
          // In the mirrored preview her own right is the screen's right.
          tickInfo.push({ side: Math.cos(t) > 0.08 ? "right" : Math.cos(t) < -0.08 ? "left" : null, reach: Math.abs(Math.sin(t)) });
        }

        var progress = text("div", "bw-progress");
        var rules = [];
        var steps = POSES.map(function (p, i) {
          if (i) {
            var rule = text("span", "rule");
            rules.push(rule);
            progress.appendChild(rule);
          }
          var step = text("div", "s");
          step.appendChild(text("i", null, String(i + 1)));
          step.appendChild(text("span", null, POSE_NAME[p]));
          progress.appendChild(step);
          return step;
        });
        scroll.appendChild(progress);

        var stage = el(
          '<div class="bw-stage">' +
            '<video autoplay playsinline muted></video>' +
            '<svg viewBox="0 0 ' + VIEW.w + " " + VIEW.h + '" preserveAspectRatio="xMidYMid slice">' +
              '<path fill="rgba(20,16,22,.42)" fill-rule="evenodd" d="M0,0H' + VIEW.w + "V" + VIEW.h + 'H0Z ' + ovalPath + '"/>' +
              '<ellipse class="bw-oval" cx="' + OVAL.cx + '" cy="' + OVAL.cy + '" rx="' + OVAL.rx + '" ry="' + OVAL.ry + '"/>' +
              '<g class="bw-ticks">' + tickMarkup + "</g>" +
              '<path class="bw-ring" d="' + ringPath + '" pathLength="100" stroke-dasharray="0 100"/>' +
            "</svg>" +
            '<div class="bw-count"></div>' +
            '<div class="bw-flash"></div>' +
            '<div class="bw-done"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29"/><path d="M20 33l8 8 16-17"/></svg></div>' +
            '<div class="bw-scrim">' +
              '<p class="bw-cue"><span class="bw-chev l" hidden><i></i><i></i><i></i></span><span class="t"></span>' +
                '<span class="bw-chev r" hidden><i></i><i></i><i></i></span></p>' +
              '<p class="bw-cue-sub"></p>' +
              '<div class="bw-meter" hidden><div class="track"><span class="zone"></span><span class="dot"></span></div>' +
                '<div class="ends"><span class="from">Lurus</span><span class="fit">Pas</span></div></div>' +
              '<button class="bw-link" hidden></button>' +
            "</div>" +
          "</div>"
        );
        scroll.appendChild(stage);

        var video = stage.querySelector("video");
        var oval = stage.querySelector(".bw-oval");
        var ring = stage.querySelector(".bw-ring");
        var count = stage.querySelector(".bw-count");
        var flash = stage.querySelector(".bw-flash");
        var done = stage.querySelector(".bw-done");
        var ticksG = stage.querySelector(".bw-ticks");
        var tickEls = ticksG.querySelectorAll("line");
        var cue = stage.querySelector(".bw-cue");
        var cueText = cue.querySelector(".t");
        var chevL = cue.querySelector(".bw-chev.l");
        var chevR = cue.querySelector(".bw-chev.r");
        var cueSub = stage.querySelector(".bw-cue-sub");
        var meter = stage.querySelector(".bw-meter");
        var meterZone = meter.querySelector(".zone");
        var meterDot = meter.querySelector(".dot");
        var meterFrom = meter.querySelector(".from");
        var meterFit = meter.querySelector(".fit");
        var manual = stage.querySelector(".bw-link");

        var probe = document.createElement("canvas");
        probe.width = PROBE.w;
        probe.height = PROBE.h;
        var probeCtx = probe.getContext("2d", { willReadFrequently: true });

        var photos = { front: [], right: [], left: [] };
        var thumbs = {};
        var tracker; // undefined while loading, null without it
        var trackerSince = Date.now();
        var poseIndex = 0;
        var phase = "checking"; // checking | countdown | bursting | captured
        var goodTicks = 0;
        var previous = null;
        var poseSince = Date.now();
        var countdownLeft = 0;

        loadTracker().then(function (t) { tracker = t; });

        function pose() { return POSES[poseIndex]; }

        function setCue(words, good, turnKey) {
          cueText.textContent = words;
          cue.className = "bw-cue" + (good ? " good" : "");
          chevR.hidden = turnKey !== "turnRight";
          chevL.hidden = turnKey !== "turnLeft";
        }

        function setStatus(key) {
          setCue(STATUS[key], GOOD[key], key);
          oval.setAttribute("class", "bw-oval" + (GOOD[key] ? " ok" : ""));
          stage.classList.toggle("good", !!GOOD[key]);
        }

        function setRing(fraction) {
          ring.style.opacity = fraction > 0 ? "1" : "0";
          ring.setAttribute("stroke-dasharray", Math.round(Math.min(1, fraction) * 100) + " 100");
        }

        /** The live guides: the ticks (how far she has turned, toward 20°)
         * and, on a side photo, the turn meter with its green zone. */
        function updateGuides(turn, key) {
          var p = pose();
          var dir = POSE_DIR[p];
          var live = dir !== 0 && phase !== "captured";
          var turned = live && turn ? turn.yaw * dir : 0;
          var reach = Math.max(0, Math.min(1, turned / SIDE_MIN_YAW));
          var ok = key === "ready" || key === "readySide";
          ticksG.setAttribute("class", "bw-ticks" + (ok ? " ok" : key === "turnLess" ? " far" : ""));
          for (var i = 0; i < tickEls.length; i++) {
            var on = live && tickInfo[i].side === p;
            tickEls[i].setAttribute("class", on ? (tickInfo[i].reach <= reach - 0.001 || reach >= 1 ? "side lit" : "side") : "");
          }
          meter.hidden = !live || !turn;
          if (live && turn) {
            var at = Math.max(0, Math.min(1, turned / METER_MAX_YAW));
            meterDot.style.left = ((dir > 0 ? at : 1 - at) * 100).toFixed(1) + "%";
            meter.className = "bw-meter" + (dir < 0 ? " flip" : "") + (key === "readySide" ? " ok" : key === "turnLess" ? " far" : "");
          }
        }

        /** Light and steadiness from a small copy of what the stage shows,
         * inside `box` (the tracked face, viewfinder 0-1) or else the oval. */
        function sample(box) {
          var vw = video.videoWidth, vh = video.videoHeight;
          var W = PROBE.w, H = PROBE.h;
          var crop = coverCrop(vw, vh);
          probeCtx.drawImage(video, crop.x * vw, crop.y * vh, crop.w * vw, crop.h * vh, 0, 0, W, H);
          var px = probeCtx.getImageData(0, 0, W, H).data;
          var cx = W / 2, cy = H * OVAL.cy / VIEW.h, rx = W * OVAL.rx / VIEW.w * 0.85, ry = H * OVAL.ry / VIEW.h * 0.85;
          var n = 0, sum = 0, left = 0, nl = 0, right = 0, nr = 0, skin = 0, clipped = 0, motion = 0;
          var luma = new Float32Array(W * H);
          for (var y = 0; y < H; y++) {
            for (var x = 0; x < W; x++) {
              if (box) {
                var u = (x + 0.5) / W, v = (y + 0.5) / H;
                if (u < box.x0 || u > box.x1 || v < box.y0 || v > box.y1) continue;
              } else {
                var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
                if (dx * dx + dy * dy > 1) continue;
              }
              var i = (y * W + x) * 4, r = px[i], g = px[i + 1], b = px[i + 2];
              var l = 0.299 * r + 0.587 * g + 0.114 * b;
              luma[y * W + x] = l;
              n++; sum += l;
              if (x < W / 2) { left += l; nl++; } else { right += l; nr++; }
              if (l > 250) clipped++;
              // Classic YCbCr skin box — holds across skin tones well enough to tell "a face is here".
              var cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
              var cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
              if (cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) skin++;
              if (previous) motion += Math.abs(l - previous[y * W + x]);
            }
          }
          var steady = !!previous && motion / Math.max(1, n) <= 7;
          previous = luma;
          n = Math.max(1, n);
          return {
            mean: sum / n,
            clipped: clipped / n,
            skin: skin / n,
            uneven: nl && nr ? Math.abs(left / nl - right / nr) / Math.max(1, sum / n) : 0,
            steady: steady,
          };
        }

        function lightKey(stats, front) {
          if (stats.mean < 60) return "dark";
          if (stats.mean > 215 || stats.clipped > 0.12) return "bright";
          // A turned face is lit unevenly by nature; only the front photo is held to it.
          if (front && stats.uneven > 0.35) return "uneven";
          return null;
        }

        /** One check with the face mesh: framing, light, head angle, stillness. */
        function checkTracked() {
          var p = pose();
          var vw = video.videoWidth, vh = video.videoHeight;
          var result;
          try {
            result = tracker.detectForVideo(video, performance.now());
          } catch (e) {
            return { key: "noface", turn: null };
          }
          var lm = result.faceLandmarks && result.faceLandmarks[0];
          if (!lm) { sample(null); return { key: "noface", turn: null }; }
          var crop = coverCrop(vw, vh);
          var box = { x0: 1, x1: 0, y0: 1, y1: 0 };
          lm.forEach(function (pt) {
            var x = (pt.x - crop.x) / crop.w, y = (pt.y - crop.y) / crop.h;
            if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x;
            if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
          });
          var turn = headTurn(lm, vh / vw);
          var fr = framing(p, box);
          var w = box.x1 - box.x0, h = box.y1 - box.y0;
          var stats = sample({ x0: box.x0 + 0.15 * w, x1: box.x1 - 0.15 * w, y0: box.y0 + 0.1 * h, y1: box.y1 - 0.05 * h });
          if (fr !== "ok") return { key: fr, turn: turn };
          var light = lightKey(stats, p === "front");
          if (light) return { key: light, turn: turn };
          var hint = poseHint(p, turn, p === "front" ? blendshapes(result) : null);
          if (hint !== "ok") return { key: hint, turn: turn };
          if (!stats.steady) return { key: "motion", turn: turn };
          return { key: p === "front" ? "ready" : "readySide", turn: turn };
        }

        /** One check without it: light, a face-coloured oval and stillness (front only). */
        function checkUntracked() {
          var stats = sample(null);
          var light = lightKey(stats, true);
          if (light) return { key: light, turn: null };
          if (stats.skin < 0.35) return { key: "noface", turn: null };
          if (!stats.steady) return { key: "motion", turn: null };
          return { key: "ready", turn: null };
        }

        function grab() {
          var vw = video.videoWidth, vh = video.videoHeight;
          var scale = Math.min(1, FRAME_MAX_SIDE / Math.max(vw, vh));
          var c = document.createElement("canvas");
          c.width = Math.round(vw * scale);
          c.height = Math.round(vh * scale);
          // Drawn as the camera sees it — not mirrored like the preview.
          c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
          return c.toDataURL("image/jpeg", 0.88);
        }

        /** A small preview of what the stage shows, mirrored as she saw it. */
        function grabThumb() {
          var vw = video.videoWidth, vh = video.videoHeight;
          var crop = coverCrop(vw, vh);
          var c = document.createElement("canvas");
          c.width = 120;
          c.height = 150;
          var ctx = c.getContext("2d");
          ctx.translate(120, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, crop.x * vw, crop.y * vh, crop.w * vw, crop.h * vh, 0, 0, 120, 150);
          return c.toDataURL("image/jpeg", 0.8);
        }

        function keep(p, frame) {
          photos[p] = photos[p].concat([frame]).slice(-BURST[p]);
        }

        function startPose() {
          var p = pose();
          var dir = POSE_DIR[p];
          phase = "checking";
          goodTicks = 0;
          previous = null;
          poseSince = Date.now();
          manual.hidden = true;
          manual.textContent = p === "front" ? "Ambil foto sekarang" : "Ambil foto sisi ini";
          count.innerHTML = "";
          done.classList.remove("go");
          setRing(0);
          steps.forEach(function (step, i) {
            step.className = "s" + (i < poseIndex ? " done" : i === poseIndex ? " now" : "");
          });
          cueSub.textContent = POSE_SUB[p];
          // The meter's green zone: from the side photo's least turn to its most.
          var zoneFrom = dir > 0 ? SIDE_MIN_YAW / METER_MAX_YAW : 1 - SIDE_MAX_YAW / METER_MAX_YAW;
          var zoneWidth = (SIDE_MAX_YAW - SIDE_MIN_YAW) / METER_MAX_YAW;
          meterZone.style.left = zoneFrom * 100 + "%";
          meterZone.style.width = zoneWidth * 100 + "%";
          meterFrom.style.left = dir > 0 ? "12px" : "calc(100% - 12px)";
          meterFit.style.left = (zoneFrom + zoneWidth / 2) * 100 + "%";
          updateGuides(null, "");
          if (p !== "front") {
            setStatus(p === "right" ? "turnRight" : "turnLeft");
            // Without the face mesh a side photo can't be judged live: give her time to turn, then count down.
            if (tracker === null) later(function () { if (pose() === p && phase === "checking") startCountdown(); }, SIDE_LEAD_MS);
          }
        }

        /** Takes the pose: a soft flash and a check, the photo drops into its
         * step, then the next pose. */
        function finishPose() {
          var p = pose();
          phase = "captured";
          var thumb = grabThumb();
          thumbs[p] = thumb;
          var slot = steps[poseIndex].querySelector("i");
          slot.textContent = "";
          var img = document.createElement("img");
          img.src = thumb;
          img.alt = "";
          slot.appendChild(img);
          steps[poseIndex].className = "s done";
          if (rules[poseIndex]) rules[poseIndex].className = "rule on";
          flash.classList.remove("go");
          done.classList.remove("go");
          void flash.offsetWidth; // restart the animations
          flash.classList.add("go");
          done.classList.add("go");
          setRing(1);
          updateGuides(null, "ready");
          oval.setAttribute("class", "bw-oval ok");
          manual.hidden = true;
          setCue("Tersimpan", true, null);
          cueSub.textContent = POSE_NEXT[p];
          later(function () {
            stage.classList.remove("good");
            if (poseIndex < POSES.length - 1) {
              poseIndex++;
              startPose();
              return;
            }
            stopCamera();
            state.lastThumbs = thumbs;
            submitScan({ frames: photos.front, right: photos.right, left: photos.left }, uuid());
          }, CAPTURED_MS);
        }

        /** The manual shutter and the fallback countdown: a short burst of its own. */
        function shootBurst(n) {
          var p = pose();
          phase = "bursting";
          setStatus("capture");
          var taken = 0;
          (function shoot() {
            if (!scan.stream) return;
            keep(p, grab());
            taken++;
            setRing(taken / n);
            if (taken < n) { later(shoot, MANUAL_BURST_GAP_MS); return; }
            finishPose();
          })();
        }

        function startCountdown() {
          phase = "countdown";
          countdownLeft = 3;
          (function step() {
            if (phase !== "countdown") return;
            if (countdownLeft === 0) {
              count.innerHTML = "";
              shootBurst(pose() === "front" ? BURST.front : 2);
              return;
            }
            count.innerHTML = "<span>" + countdownLeft + "</span>";
            countdownLeft--;
            later(step, COUNTDOWN_MS);
          })();
        }

        function tick() {
          if (!video.videoWidth || phase === "bursting" || phase === "captured") return;
          var p = pose();
          if (Date.now() - poseSince > MANUAL_AFTER_MS[p] && phase === "checking") manual.hidden = false;

          if (tracker === undefined) {
            if (Date.now() - trackerSince > TRACKER_LOAD_MS) tracker = null; // scan without it
            else { setStatus("loading"); return; }
          }
          if (tracker === null) {
            // Timed side photos run on their own countdown (startPose).
            if (p !== "front") return;
            var r0 = checkUntracked();
            if (phase === "countdown") {
              if (r0.key !== "ready" && r0.key !== "motion") { phase = "checking"; goodTicks = 0; count.innerHTML = ""; setStatus(r0.key); }
              return;
            }
            if (r0.key === "ready") {
              goodTicks++;
              setStatus(goodTicks >= 3 ? "ready" : "motion");
              if (goodTicks >= FALLBACK_READY_TICKS) startCountdown();
            } else {
              goodTicks = 0;
              setStatus(r0.key);
            }
            updateGuides(null, goodTicks >= 3 ? "ready" : "");
            return;
          }

          var r = checkTracked();
          var ok = r.key === "ready" || r.key === "readySide";
          updateGuides(r.turn, r.key);
          setStatus(r.key);
          if (!ok) {
            goodTicks = 0;
            photos[p] = [];
            setRing(0);
            return;
          }
          goodTicks++;
          setRing(goodTicks / HOLD_TICKS[p]);
          // Keep the frames taken while the pose is held: every one passed every check.
          if (goodTicks > HOLD_TICKS[p] - BURST[p]) keep(p, grab());
          if (goodTicks >= HOLD_TICKS[p]) finishPose();
        }

        manual.addEventListener("click", function () {
          if ((phase === "checking" || phase === "countdown") && video.videoWidth) {
            count.innerHTML = "";
            shootBurst(MANUAL_BURST[pose()]);
          }
        });

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          renderError("Kamera tidak tersedia", "Browser ini tidak mendukung akses kamera.", null);
          return;
        }
        setStatus("start");
        startPose();
        navigator.mediaDevices
          .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
          .then(function (stream) {
            if (scanView.hidden) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
            scan.stream = stream;
            video.srcObject = stream;
            poseSince = Date.now();
            scan.timer = setInterval(tick, CHECK_MS);
          })
          .catch(function () {
            renderError("Kamera belum diizinkan", "Izinkan akses kamera di browser, lalu coba lagi.", null);
          });
      }

      // ------------------------------------------------------------ 3. analysing

      function renderAnalysing() {
        var scroll = scanLayout(null);
        var wait = text("div", "bw-wait");
        var shots = state.lastThumbs || {};
        // Her three photos fanned out: turned left, front, turned right.
        var fan = text("div", "bw-fanph");
        [["left", "l"], ["front", "c"], ["right", "r"]].forEach(function (x) {
          if (!shots[x[0]]) return;
          var img = document.createElement("img");
          img.src = shots[x[0]];
          img.alt = "";
          img.className = x[1];
          fan.appendChild(img);
        });
        if (fan.children.length) wait.appendChild(fan);
        wait.appendChild(text("div", "bw-kicker", "Hampir selesai"));
        wait.appendChild(text("h3", "bw-title", "Sedang membaca hasilmu"));
        var bar = text("div", "bw-run");
        wait.appendChild(bar);
        var list = text("ul", "bw-stepsl");
        ["Warna kulit dan rambut", "Proporsi wajah", "Kondisi kulit", "Shade dari katalog"].forEach(function (label) {
          var li = document.createElement("li");
          var mark = document.createElement("i");
          mark.innerHTML = ICON.check;
          li.appendChild(mark);
          li.appendChild(text("span", null, label));
          list.appendChild(li);
        });
        wait.appendChild(list);
        scroll.appendChild(wait);
        var items = list.querySelectorAll("li");
        var at = 0;
        items[0].className = "run";
        function advance() {
          if (at >= items.length - 1) return;
          items[at].className = "done";
          at++;
          items[at].className = "run";
          later(advance, 750);
        }
        later(advance, 750);
        return function finish(next) {
          scan.timeouts.forEach(clearTimeout);
          scan.timeouts = [];
          for (var i = 0; i < items.length; i++) items[i].className = "done";
          bar.className = "bw-run full";
          later(next, 500);
        };
      }

      function submitScan(photos, requestId, retried) {
        var finish = renderAnalysing();
        var startedAt = Date.now();
        fetch(API_BASE + "/api/widget/beauty-analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: state.sessionId,
            requestId: requestId,
            frames: photos.frames,
            right: photos.right,
            left: photos.left,
          }),
        })
          .then(function (res) {
            return res.json().catch(function () { return { error: "scan_failed" }; }).then(function (data) {
              return { status: res.status, data: data };
            });
          })
          .then(function (r) {
            if (r.data && r.data.error === "invalid_session" && !retried) {
              // The saved session is gone (e.g. a reset database) — start a fresh one.
              storageSet(SESSION_KEY, "");
              return ensureSession().then(function (sid) {
                state.sessionId = sid;
                submitScan(photos, requestId, true);
              });
            }
            // Let the steps play for at least a moment — instant results feel unearned.
            var wait = Math.max(0, 2200 - (Date.now() - startedAt));
            later(function () {
              if (r.status >= 400 || !r.data || r.data.error) {
                var known = ERROR_TEXT[r.data && r.data.error];
                if (known) renderError(known[0], known[1], r.status >= 500 ? function () { submitScan(photos, requestId); } : null);
                else renderError("Analisis gagal", "Coba kirim ulang sebentar lagi.", function () { submitScan(photos, requestId); });
                return;
              }
              finish(function () {
                state.lastScan = r.data;
                renderResults(r.data);
              });
            }, wait);
          })
          .catch(function () {
            renderError("Tidak bisa terhubung ke server", "Periksa koneksimu, lalu kirim ulang.", function () { submitScan(photos, requestId); });
          });
      }

      function renderError(title, message, resend) {
        stopCamera();
        var actions = [];
        if (resend) actions.push({ label: "Kirim ulang", primary: true, onClick: resend });
        actions.push({ label: "Scan lagi", primary: !resend, onClick: renderCamera });
        actions.push({ label: "Ke chat", onClick: showChatView });
        var scroll = scanLayout(actions);
        var box = text("div", "bw-error");
        var ic = text("div", "ic");
        ic.innerHTML = ICON.alert;
        box.appendChild(ic);
        box.appendChild(text("h4", null, title));
        box.appendChild(text("p", null, message));
        scroll.appendChild(box);
      }

      // ------------------------------------------------------------ 4. results

      var UNDERTONE = { warm: "hangat", cool: "dingin", neutral: "netral" };

      function skinTypeWord(r) {
        return ((r.skin && r.skin.analysis && r.skin.analysis.summary) || "").replace(/^Kulit\s+/i, "").toLowerCase();
      }

      function capital(word) {
        return word ? word.charAt(0).toUpperCase() + word.slice(1) : word;
      }

      function swatch(tag, hex, title) {
        var node = document.createElement(tag);
        node.style.background = hex;
        if (title) node.title = title;
        return node;
      }

      function addArt(holder, art) {
        if (typeof art === "string") holder.innerHTML = art; else holder.appendChild(art);
      }

      function renderResults(r) {
        var scroll = scanLayout([
          { label: "Tanya di chat", primary: true, onClick: function () { goToChat(r); } },
          { label: "Scan lagi", onClick: renderCamera },
        ]);
        var c = r.colour || {};
        var season = c.season;
        var shape = r.faceShape && r.faceShape.shape;
        var pal = paletteHexes(c, 8);
        var shots = state.lastThumbs || {};

        // The headline: her photo, her season, and the season's colours —
        // tinted with them, so every result looks like its own.
        var hero = text("div", "bw-rhero");
        if (pal.length >= 2) {
          hero.style.background = "linear-gradient(150deg,color-mix(in srgb," + pal[0].hex + " 20%,#fff),color-mix(in srgb," + pal[1].hex + " 16%,#fff))";
        }
        var top = text("div", "top");
        if (shots.front) {
          var ph = text("div", "ph");
          var img = document.createElement("img");
          img.src = shots.front;
          img.alt = "";
          ph.appendChild(img);
          top.appendChild(ph);
        }
        var words = document.createElement("div");
        words.appendChild(text("div", "k", season ? "Musim warnamu" : "Profil kecantikanmu"));
        words.appendChild(text("h3", null, season ? season.displayName : "Hasil scan"));
        words.appendChild(text("div", "m", season
          ? season.confidencePercent + "% cocok · undertone " + (UNDERTONE[c.undertone] || "netral")
          : "Musim warna belum terbaca kali ini."));
        top.appendChild(words);
        hero.appendChild(top);
        if (pal.length) {
          var strip = text("div", "pal");
          pal.forEach(function (sw, i) {
            var chip = swatch("i", sw.hex, sw.name);
            chip.style.animationDelay = 120 + i * 45 + "ms";
            strip.appendChild(chip);
          });
          hero.appendChild(strip);
        }
        scroll.appendChild(hero);

        // The three readings, each drawn from the result; they are the tabs too.
        var fan = paletteHexes(c, 4).map(function (sw) { return sw.hex; });
        var defs = [
          { label: "Warna", value: season && season.displayName, art: fan.length ? fanEl(fan) : '<i class="none"></i>', render: renderColourTab },
          { label: "Bentuk", value: shape && shape.displayName, art: shape ? faceShapeIcon(shape.key, 30) : '<i class="none"></i>', render: renderShapeTab },
          { label: "Kulit", value: capital(skinTypeWord(r)), art: skinEl(safeHex(c.evidence && c.evidence.skin)), render: renderSkinTab },
        ];
        var tiles = el('<div class="bw-tiles" role="tablist"></div>');
        var holder = text("div");
        var buttons = defs.map(function (d, i) {
          var b = document.createElement("button");
          b.setAttribute("role", "tab");
          var art = text("span", "art");
          addArt(art, d.art);
          b.appendChild(art);
          b.appendChild(text("small", null, d.label));
          b.appendChild(text("b", d.value ? null : "off", d.value || "Belum terbaca"));
          b.addEventListener("click", function () { select(i); });
          tiles.appendChild(b);
          return b;
        });
        function select(i) {
          buttons.forEach(function (b, j) { b.setAttribute("aria-selected", String(i === j)); });
          holder.innerHTML = "";
          var panelEl = text("div", "bw-tabpanel");
          panelEl.setAttribute("role", "tabpanel");
          defs[i].render(panelEl, r);
          holder.appendChild(panelEl);
        }
        scroll.appendChild(tiles);
        scroll.appendChild(holder);
        select(0);
      }

      var RETRY_TIPS = {
        face_straight: ["Hadap lurus ke kamera, dagu sejajar.", "Letakkan kamera kira-kira setinggi mata."],
        neutral_face: ["Wajah rileks dengan mulut tertutup.", "Tahan senyum sampai garis di oval penuh."],
        hold_still: ["Diam sampai garis di oval penuh.", "Sandarkan siku, atau taruh ponsel di meja."],
        cannot_measure: ["Cari cahaya terang dari depan.", "Pastikan seluruh wajah ada di dalam oval."],
        more_light: ["Menghadap jendela atau lampu.", "Hindari cahaya terang dari belakang."],
        less_light: ["Menjauh dari cahaya yang terlalu terang.", "Cahaya siang yang lembut paling baik."],
        show_hair: ["Biarkan sedikit rambut terlihat.", "Hijab juga tidak apa-apa."],
      };

      /** A reading that couldn't be made this time: what happened, what to try,
       * and the way back to the camera. */
      function retryCard(p, kind, remedy, message) {
        var box = text("div", "bw-retry");
        var ic = text("div", "ic");
        ic.innerHTML = kind === "shape" ? faceShapeIcon("oval", 24) : ICON.palette;
        box.appendChild(ic);
        box.appendChild(text("h4", null, kind === "shape" ? "Bentuk wajah belum terbaca" : "Musim warna belum terbaca"));
        if (message) box.appendChild(text("p", null, message));
        box.appendChild(text("div", "bw-label", "Coba ini"));
        var list = document.createElement("ol");
        (RETRY_TIPS[remedy] || RETRY_TIPS.cannot_measure).forEach(function (tip) { list.appendChild(text("li", null, tip)); });
        box.appendChild(list);
        var again = text("button", "bw-btn-primary", "Scan ulang");
        again.addEventListener("click", renderCamera);
        box.appendChild(again);
        p.appendChild(box);
      }

      /** A white section on the warm page, with a serif heading. */
      function section(p, title) {
        var box = text("section", "bw-sec");
        if (title) box.appendChild(text("h5", null, title));
        p.appendChild(box);
        return box;
      }

      // Each colour axis drawn as what it measures: dark to light, soft to
      // clear, cool to warm.
      var AXIS_TRACK = {
        value: "linear-gradient(90deg,#3E2C2A,#9A7564,#F4E6DA)",
        chroma: "linear-gradient(90deg,#BBADA9,#D98C95,#EF3E6D)",
        warmth: "linear-gradient(90deg,#B7A7DA,#EAD8D2,#EDB061)",
      };

      function scale(p, a, low, high, mid) {
        var off = a.measured === false;
        var row = text("div", "bw-scale" + (off ? " off" : ""));
        var top = text("div", "top");
        top.appendChild(text("span", null, a.label));
        top.appendChild(text("b", null, a.verdict));
        row.appendChild(top);
        var line = text("div", "line");
        if (!off && AXIS_TRACK[a.axis]) line.style.background = AXIS_TRACK[a.axis];
        if (!off) {
          var dot = document.createElement("i");
          dot.style.left = Math.round(Math.max(0, Math.min(1, a.position)) * 100) + "%";
          line.appendChild(dot);
        }
        row.appendChild(line);
        var ends = text("div", "ends");
        ends.appendChild(text("span", null, low));
        if (mid) ends.appendChild(text("span", null, mid));
        ends.appendChild(text("span", null, high));
        row.appendChild(ends);
        p.appendChild(row);
      }

      function renderColourTab(p, r) {
        var c = r.colour || {};
        var season = c.season;
        if (!season) {
          retryCard(p, "colour", c.remedyKey, c.remedyText || "Warnamu belum terbaca kali ini.");
          return;
        }
        var about = section(p, "Kenapa " + season.displayName);
        if (c.description) about.appendChild(text("p", "bw-text", c.description));
        if (!season.conclusive && season.runnerUp) about.appendChild(text("p", "bw-metaline", "Dekat juga dengan " + season.runnerUp.displayName + "."));
        var ev = c.evidence || {};
        var keys = text("div", "bw-keys");
        function key(dot, words) {
          var k = document.createElement("div");
          k.appendChild(dot);
          k.appendChild(text("span", null, words));
          keys.appendChild(k);
        }
        if (safeHex(ev.skin)) key(skinEl(ev.skin), "Kulitmu");
        if (ev.hasHair && safeHex(ev.hair)) key(skinEl(ev.hair), "Rambutmu");
        key(text("i", "bw-tone " + (c.undertone || "neutral")), "Undertone " + (UNDERTONE[c.undertone] || "netral"));
        about.appendChild(keys);

        if ((c.attributes || []).length) {
          var axes = section(p, "Yang menentukan musimmu");
          c.attributes.forEach(function (a) { scale(axes, a, a.negativeLabel, a.positiveLabel); });
        }

        var cats = (c.palette && c.palette.categories) || [];
        if (cats.length) {
          var palette = section(p, "Palet makeup");
          cats.forEach(function (cat) {
            var row = text("div", "bw-pal");
            row.appendChild(text("span", null, cat.label));
            var chips = document.createElement("div");
            cat.swatches.forEach(function (sw) { if (safeHex(sw.hex)) chips.appendChild(swatch("i", sw.hex, sw.name)); });
            row.appendChild(chips);
            palette.appendChild(row);
          });
          if (c.palette.status === "placeholder") palette.appendChild(text("p", "bw-caveat", "Palet ini masih versi awal dan akan terus disempurnakan."));
        }

        // Real catalog shades closest to her palette, on a shelf she can swipe.
        var picks = [];
        (r.catalogShades || []).forEach(function (g) {
          (g.matches || []).slice(0, 3).forEach(function (m) { picks.push({ group: g.label, m: m }); });
        });
        if (picks.length) {
          p.appendChild(text("div", "bw-label", "Dari katalog, paling dekat dengan paletmu"));
          var shelf = text("div", "bw-shelf");
          picks.forEach(function (x) {
            var m = x.m;
            var card = text("div", "bw-pc");
            card.title = "Paling dekat dengan " + m.swatchName;
            var sw = swatch("div", safeHex(m.colorHex) || "#eee");
            sw.className = "sw";
            sw.appendChild(text("span", null, x.group));
            card.appendChild(sw);
            var tx = text("div", "tx");
            tx.appendChild(text("small", null, m.brand));
            tx.appendChild(text("span", "nm", (m.colorName ? m.colorName + " · " : "") + m.name));
            tx.appendChild(text("b", null, rupiah(m.price)));
            card.appendChild(tx);
            shelf.appendChild(card);
          });
          p.appendChild(shelf);
        }

        if (c.remedyText) p.appendChild(text("p", "bw-note", c.remedyText));
        if (c.caveat) p.appendChild(text("p", "bw-caveat", c.caveat));
      }

      function renderShapeTab(p, r) {
        var f = r.faceShape || {};
        var shape = f.shape;
        if (!shape) {
          retryCard(p, "shape", f.source && f.source.remedy, f.remedyText || "Bentuk wajahmu belum terbaca kali ini.");
          return;
        }
        var approximate = f.source && f.source.quality === "approximate";
        var top = section(p);
        var head = text("div", "bw-shapehero");
        var art = text("div", "art");
        art.innerHTML = faceShapeIcon(shape.key, 50, true);
        head.appendChild(art);
        var words = document.createElement("div");
        words.appendChild(text("h4", null, shape.displayName));
        words.appendChild(text("p", "bw-metaline", (approximate ? "Perkiraan · " : "") +
          (shape.alsoFits ? "juga mendekati " + shape.alsoFits.displayName : shape.confidencePercent + "% cocok")));
        head.appendChild(words);
        top.appendChild(head);
        if (f.description) top.appendChild(text("p", "bw-text", f.description));
        if (approximate && f.approximateNote) top.appendChild(text("p", "bw-note warn", f.approximateNote));
        if (f.coveredNote) top.appendChild(text("p", "bw-caveat", f.coveredNote));

        if ((f.axes || []).length) {
          var axes = section(p, "Proporsi");
          f.axes.forEach(function (a) { scale(axes, a, a.lowLabel, a.highLabel, a.midLabel); });
        }

        var looks = (f.looks && f.looks.ranked) || [];
        if (looks.length) {
          var box = section(p, (f.looks && f.looks.title) || "Look yang cocok");
          looks.forEach(function (l) {
            var row = text("div", "bw-look");
            var img = document.createElement("img");
            img.loading = "lazy";
            img.alt = l.displayName;
            if (typeof l.imageUrl === "string" && /^https?:\/\//.test(l.imageUrl)) img.src = l.imageUrl;
            img.addEventListener("error", function () { img.style.visibility = "hidden"; });
            row.appendChild(img);
            var meta = document.createElement("div");
            meta.appendChild(text("b", null, l.displayName));
            meta.appendChild(text("span", "bw-tier " + l.tier, l.fitLabel));
            meta.appendChild(text("p", null, l.note || l.character));
            row.appendChild(meta);
            box.appendChild(row);
          });
        }
        if (f.caveat) p.appendChild(text("p", "bw-caveat", f.caveat));
      }

      var SKIN_FINDINGS = [
        ["bersinar", "kilap"],
        ["pori_besar", "pori terlihat"],
        ["noda_hitam", "noda gelap"],
        ["jerawat", "jerawat"],
        ["garis_halus", "garis halus"],
      ];

      /** What a region shows, and how much: lo (nothing stands out), mid, hi. */
      function regionFindings(d) {
        if (!d.measured) return { words: "belum terbaca", level: "" };
        var found = [];
        var level = "lo";
        SKIN_FINDINGS.forEach(function (f) {
          var v = d[f[0]];
          if (v >= 0.6) { found.push(f[1] + " jelas"); level = "hi"; }
          else if (v >= 0.3) { found.push(f[1] + " sedikit"); if (level === "lo") level = "mid"; }
        });
        if (d.warna_kulit_merata < 0.5) { found.push("warna kurang merata"); if (level === "lo") level = "mid"; }
        return { words: found.length ? found.join(", ") : "tidak ada yang menonjol", level: level };
      }

      function scoreBand(score) {
        if (score >= 80) return "sangat baik";
        if (score >= 60) return "baik";
        if (score >= 40) return "cukup";
        return "perlu perhatian";
      }

      function dial(value) {
        var v = Math.max(0, Math.min(100, Math.round(value)));
        var node = el('<div class="bw-dial"><svg viewBox="0 0 76 76" aria-hidden="true"><circle class="bg" cx="38" cy="38" r="32"/>' +
          '<circle class="arc" cx="38" cy="38" r="32" pathLength="100" stroke-dasharray="' + v + ' 100"/></svg><div><b></b><small>dari 100</small></div></div>');
        node.querySelector("b").textContent = String(v);
        return node;
      }

      function renderSkinTab(p, r) {
        var s = r.skin || {};
        var detail = (s.analysis && s.analysis.detail) || [];
        var fromSides = detail.some(function (d) { return d.source && d.source !== "front"; });
        var m = r.skinMetrics;
        var top = section(p);
        var head = text("div", "bw-skinhero");
        if (m) head.appendChild(dial(m.overall));
        var words = document.createElement("div");
        words.appendChild(text("h4", null, capital(skinTypeWord(r)) || "Kulit"));
        words.appendChild(text("p", "bw-metaline", "Perkiraan dari " + (fromSides ? "3 foto · tiap pipi dari foto samping yang menghadapnya" : "satu foto depan")));
        if (m) words.appendChild(text("p", "bw-metaline", "Skor kulit " + scoreBand(m.overall)));
        head.appendChild(words);
        top.appendChild(head);

        var shots = state.lastThumbs || {};
        var poses = r.poses || [];
        if (shots.front) {
          var grid = text("div", "bw-photos");
          [
            ["front", "Depan · dahi, hidung, dagu"],
            ["right", "Toleh kanan · pipi kiri"],
            ["left", "Toleh kiri · pipi kanan"],
          ].forEach(function (x) {
            var info = poses.filter(function (q) { return q.pose === x[0]; })[0];
            var used = x[0] === "front" || (info && info.accepted);
            var fig = document.createElement("figure");
            if (!used) fig.className = "off";
            if (shots[x[0]]) {
              var img = document.createElement("img");
              img.src = shots[x[0]];
              img.alt = "";
              fig.appendChild(img);
            }
            fig.appendChild(text("figcaption", null, x[1]));
            grid.appendChild(fig);
          });
          top.appendChild(grid);
          var REASON = {
            not_turned: "kepala kurang menoleh",
            wrong_way: "kepala menoleh ke arah sebaliknya",
            turned_too_far: "kepala menoleh terlalu jauh",
            no_face: "wajah tidak terdeteksi",
          };
          poses.forEach(function (q) {
            if (q.pose === "front" || q.accepted) return;
            top.appendChild(text("p", "bw-note warn", (q.pose === "right" ? "Foto toleh kanan" : "Foto toleh kiri") +
              " tidak dipakai karena " + (REASON[q.reason] || q.reason) + ", jadi pipi itu dibaca dari foto depan."));
          });
        }

        if (detail.length) {
          var areas = section(p, "Per area");
          var legend = text("div", "bw-legend");
          [["#5BB98B", "baik"], ["#E3A950", "sedikit"], ["#D8687A", "jelas"]].forEach(function (x) {
            var item = document.createElement("span");
            item.appendChild(swatch("i", x[0]));
            item.appendChild(document.createTextNode(x[1]));
            legend.appendChild(item);
          });
          areas.appendChild(legend);
          detail.forEach(function (d) {
            var found = regionFindings(d);
            var row = text("div", "bw-row2");
            row.appendChild(text("i", found.level));
            var name = text("span", null, d.label);
            if (d.source && d.source !== "front") name.appendChild(text("small", null, "dari foto samping"));
            row.appendChild(name);
            row.appendChild(text("span", null, found.words));
            areas.appendChild(row);
          });
        }

        if (m) {
          var scores = section(p, "Skor kulit");
          [
            ["Hidrasi", m.hydration],
            ["Elastisitas", m.elasticity],
            ["Pigmentasi", m.pigmentation],
            ["Tekstur", m.texture],
            ["Pori-pori", m.pores],
          ].forEach(function (x) {
            var row = el('<div class="bw-score"><div class="top"><span></span><span></span></div><div class="bar"><div></div></div></div>');
            var spans = row.querySelectorAll(".top span");
            spans[0].textContent = x[0];
            spans[1].textContent = Math.round(x[1]) + " · " + scoreBand(x[1]);
            row.querySelector(".bar div").style.width = Math.max(2, Math.round(x[1])) + "%";
            scores.appendChild(row);
          });
        }
        if (s.caveat) p.appendChild(text("p", "bw-caveat", s.caveat));
      }

      // ------------------------------------------------------------ 5. hand-off to chat

      function goToChat(r) {
        showChatView();
        var season = r.colour && r.colour.season;
        var shape = r.faceShape && r.faceShape.shape;
        var skinWord = skinTypeWord(r);
        var parts = [];
        if (season) parts.push(season.displayName);
        if (shape) parts.push("wajah " + shape.displayName.toLowerCase());
        if (skinWord) parts.push("kulit " + skinWord);
        addBotText("Hasil scan-mu sudah aku simpan" + (parts.length ? ": " + parts.join(", ") + ". " : ". ") + "Tanya apa saja, aku jawab berdasarkan hasil itu.");
        var chips = [];
        if (season) chips.push("Lipstik yang cocok untukku?");
        var base = (r.catalogShades || []).filter(function (g) { return g.id === "base" && g.matches.length; })[0];
        if (base) chips.push("Foundation yang pas untukku?");
        if (shape) chips.push("Makeup untuk bentuk wajahku?");
        if (skinWord) chips.push("Skincare untuk kulit " + skinWord);
        addChips(chips);
      }

      // ------------------------------------------------------------ chat

      function addBotText(value) {
        var row = el('<div class="bw-row bot"><div class="bw-bubble"></div></div>');
        row.querySelector(".bw-bubble").textContent = value;
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
      }
      function addUserText(value) {
        var row = el('<div class="bw-row user"><div class="bw-bubble"></div></div>');
        row.querySelector(".bw-bubble").textContent = value;
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
      }
      /** Quick replies: a string sends itself, `{label, onClick}` runs onClick. */
      function addChips(items) {
        if (!items.length) return;
        var row = text("div", "bw-chips");
        items.forEach(function (item) {
          var label = typeof item === "string" ? item : item.label;
          var b = text("button", null, label);
          b.addEventListener("click", function () {
            row.remove();
            if (typeof item === "string") send(label); else item.onClick();
          });
          row.appendChild(b);
        });
        body.appendChild(row);
        body.scrollTop = body.scrollHeight;
      }
      function addProducts(products) {
        if (!products || !products.length) return;
        var row = el('<div class="bw-row bot" style="flex-direction:column;align-items:stretch;max-width:92%;"></div>');
        products.slice(0, 4).forEach(function (p) {
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
          // A shade product shows its own colour instead of the generic icon.
          if (safeHex(p.colorHex)) {
            var ic = card.querySelector(".bw-ic");
            ic.innerHTML = "";
            ic.style.background = p.colorHex;
          }
          card.querySelector(".bw-brand").textContent = p.brand || "";
          card.querySelector(".bw-pname").textContent = (p.colorName ? p.colorName + " · " : "") + (p.name || "");
          card.querySelector(".bw-price").textContent = rupiah(p.price);
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

      function send(value) {
        if (!value || !value.trim()) return;
        addUserText(value);
        var typingRow = addTyping();
        streamChat(state.sessionId, state.conversationId, value, function (frame) {
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
      function closePanel() { panel.hidden = true; showChatView(); }
      launcher.addEventListener("click", function () {
        if (panel.hidden) openPanel(); else closePanel();
      });
      closeBtn.addEventListener("click", closePanel);
      scanBtn.addEventListener("click", function () {
        if (scanView.hidden) openScanView(); else showChatView();
      });

      function greet() {
        addBotText(state.config.greeting || "Hai! Ada yang bisa aku bantu?");
        addChips([{ label: "Scan wajahku", onClick: openScanView }]);
      }
      greet();

      // Public API, same shape as Ganes' window.GanesWidget.
      window.BeautyWidget = {
        open: openPanel,
        close: closePanel,
        toggle: function () { if (panel.hidden) openPanel(); else closePanel(); },
        ask: function (value) { openPanel(); showChatView(); send(value); },
        send: send,
        reset: function () {
          showChatView();
          state.conversationId = null;
          storageSet(CONVO_KEY, "");
          body.innerHTML = "";
          greet();
        },
        scan: openScanView,
        lastScan: function () { return state.lastScan; },
      };
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
