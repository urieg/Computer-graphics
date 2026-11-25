(() => {
  const DEFAULT_POLYGON = [
    { x: 2, y: 1 },
    { x: 9, y: 2 },
    { x: 7, y: 7 },
    { x: 1, y: 5 },
  ];

  const state = {
    mode: "liang-barsky", // "liang-barsky" | "cyrus-beck"
    rect: {
      xmin: 2,
      ymin: 1,
      xmax: 8,
      ymax: 6,
    },
    polygon: DEFAULT_POLYGON.map((p) => ({ ...p })),
    segments: [
      { x1: 0, y1: 0, x2: 10, y2: 7 },
      { x1: 3, y1: 2, x2: 6, y2: 5 },
      { x1: -2, y1: 6, x2: 1, y2: 9 },
      { x1: 1, y1: 4, x2: 9, y2: 3 },
      { x1: 5, y1: -1, x2: 5, y2: 8 },
      { x1: 0, y1: 7, x2: 11, y2: 6 },
    ],
    view: {
      scale: 52, // pixels per world unit
      offsetX: 140,
      offsetY: 420,
      isPanning: false,
      lastMouseX: 0,
      lastMouseY: 0,
    },
  };

  const els = {
    canvas: document.getElementById("sceneCanvas"),
    wrapper: document.getElementById("canvasWrapper"),
    coordsHud: document.getElementById("coordsHud"),
    modeLiangBarsky: document.getElementById("modeLiangBarsky"),
    modeCyrusBeck: document.getElementById("modeCyrusBeck"),
    rectCard: document.getElementById("rectCard"),
    polygonCard: document.getElementById("polygonCard"),
    xminInput: document.getElementById("xminInput"),
    yminInput: document.getElementById("yminInput"),
    xmaxInput: document.getElementById("xmaxInput"),
    ymaxInput: document.getElementById("ymaxInput"),
    vertexList: document.getElementById("vertexList"),
    segmentList: document.getElementById("segmentList"),
    rawDataInput: document.getElementById("rawDataInput"),
    parseTextBtn: document.getElementById("parseTextBtn"),
    syncTextBtn: document.getElementById("syncTextBtn"),
    addSegmentBtn: document.getElementById("addSegmentBtn"),
    addVertexBtn: document.getElementById("addVertexBtn"),
    applyBtn: document.getElementById("applyBtn"),
    loadSampleBtn: document.getElementById("loadSampleBtn"),
    fileInput: document.getElementById("fileInput"),
    zoomInBtn: document.getElementById("zoomInBtn"),
    zoomOutBtn: document.getElementById("zoomOutBtn"),
    fitViewBtn: document.getElementById("fitViewBtn"),
  };

  const ctx = els.canvas.getContext("2d");

  function fmt(num) {
    if (!Number.isFinite(num)) return "0";
    const rounded = Math.round(num * 1000) / 1000;
    return String(rounded);
  }

  /**
   * Liang-Barsky parametric clipping against axis-aligned rectangle [xmin, xmax] x [ymin, ymax].
   */
  function clipLiangBarsky(seg, rect) {
    const xmin = Math.min(rect.xmin, rect.xmax);
    const xmax = Math.max(rect.xmin, rect.xmax);
    const ymin = Math.min(rect.ymin, rect.ymax);
    const ymax = Math.max(rect.ymin, rect.ymax);

    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;

    const p = [-dx, dx, -dy, dy];
    const q = [
      seg.x1 - xmin,
      xmax - seg.x1,
      seg.y1 - ymin,
      ymax - seg.y1,
    ];

    let tIn = 0;
    let tOut = 1;

    for (let i = 0; i < 4; i++) {
      const pi = p[i];
      const qi = q[i];

      if (Math.abs(pi) < 1e-12) {
        if (qi < 0) {
          return { visible: false, status: "hidden", tIn, tOut };
        }
      } else {
        const t = qi / pi;
        if (pi < 0) {
          if (t > tOut) {
            return { visible: false, status: "hidden", tIn, tOut };
          }
          if (t > tIn) tIn = t;
        } else {
          if (t < tIn) {
            return { visible: false, status: "hidden", tIn, tOut };
          }
          if (t < tOut) tOut = t;
        }
      }
    }

    if (tIn > tOut) {
      return { visible: false, status: "hidden", tIn, tOut };
    }

    const clipped = {
      x1: seg.x1 + tIn * dx,
      y1: seg.y1 + tIn * dy,
      x2: seg.x1 + tOut * dx,
      y2: seg.y1 + tOut * dy,
    };

    const isFull = Math.abs(tIn) < 1e-9 && Math.abs(tOut - 1) < 1e-9;
    return {
      visible: true,
      status: isFull ? "full" : "partial",
      segment: clipped,
      tIn,
      tOut,
    };
  }

  function signedArea(poly) {
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      area += a.x * b.y - b.x * a.y;
    }
    return 0.5 * area;
  }

  function ensureCCW(poly) {
    if (poly.length < 3) return poly.slice();
    const copy = poly.map((p) => ({ x: p.x, y: p.y }));
    if (signedArea(copy) < 0) {
      copy.reverse();
    }
    return copy;
  }

  /**
   * Cyrus-Beck parametric clipping against a convex polygon.
   * Normalizes polygon winding to counter-clockwise so inward normal is (-edgeDy, edgeDx).
   */
  function clipCyrusBeck(seg, rawPoly) {
    const poly = ensureCCW(rawPoly);
    if (poly.length < 3) {
      return { visible: false, status: "hidden", tIn: 0, tOut: 1 };
    }

    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;

    let tIn = 0;
    let tOut = 1;

    for (let i = 0; i < poly.length; i++) {
      const vStart = poly[i];
      const vEnd = poly[(i + 1) % poly.length];

      const edgeDx = vEnd.x - vStart.x;
      const edgeDy = vEnd.y - vStart.y;

      const nx = -edgeDy;
      const ny = edgeDx;

      const s = dx * nx + dy * ny;
      const wX = seg.x1 - vStart.x;
      const wY = seg.y1 - vStart.y;
      const num = -(wX * nx + wY * ny);

      if (Math.abs(s) < 1e-12) {
        if (wX * nx + wY * ny < -1e-12) {
          return { visible: false, status: "hidden", tIn, tOut };
        }
      } else {
        const tE = num / s;
        if (s > 0) {
          if (tE > tIn) tIn = tE;
        } else {
          if (tE < tOut) tOut = tE;
        }
      }
    }

    if (tIn > tOut) {
      return { visible: false, status: "hidden", tIn, tOut };
    }

    const clipped = {
      x1: seg.x1 + tIn * dx,
      y1: seg.y1 + tIn * dy,
      x2: seg.x1 + tOut * dx,
      y2: seg.y1 + tOut * dy,
    };

    const isFull = Math.abs(tIn) < 1e-9 && Math.abs(tOut - 1) < 1e-9;
    return {
      visible: true,
      status: isFull ? "full" : "partial",
      segment: clipped,
      tIn,
      tOut,
    };
  }

  function clipSegment(seg) {
    if (state.mode === "liang-barsky") {
      return clipLiangBarsky(seg, state.rect);
    }
    return clipCyrusBeck(seg, state.polygon);
  }

  function syncTextFromState() {
    const lines = [];
    lines.push(String(state.segments.length));
    for (const s of state.segments) {
      lines.push(`${fmt(s.x1)} ${fmt(s.y1)} ${fmt(s.x2)} ${fmt(s.y2)}`);
    }
    lines.push(
      `${fmt(state.rect.xmin)} ${fmt(state.rect.ymin)} ${fmt(state.rect.xmax)} ${fmt(state.rect.ymax)}`
    );
    if (state.mode === "cyrus-beck" && state.polygon.length >= 3) {
      lines.push(String(state.polygon.length));
      for (const v of state.polygon) {
        lines.push(`${fmt(v.x)} ${fmt(v.y)}`);
      }
    }
    els.rawDataInput.value = lines.join("\n");
  }

  function parseTextToState(text) {
    const tokens = text
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*$/, "").trim())
      .filter((line) => line.length > 0)
      .join(" ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length < 1) {
      throw new Error("Input is empty.");
    }

    const n = Number(tokens[0]);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error("First value must be a non-negative integer segment count.");
    }

    const minExpectedCount = 1 + n * 4 + 4;
    if (tokens.length < minExpectedCount) {
      throw new Error(
        `Expected at least ${minExpectedCount} numbers (${n} segments + 4 window bounds), got ${tokens.length}.`
      );
    }

    const parsedSegments = [];
    let idx = 1;
    for (let i = 0; i < n; i++) {
      const x1 = Number(tokens[idx++]);
      const y1 = Number(tokens[idx++]);
      const x2 = Number(tokens[idx++]);
      const y2 = Number(tokens[idx++]);
      if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v))) {
        throw new Error(`Invalid coordinates on segment ${i + 1}.`);
      }
      parsedSegments.push({ x1, y1, x2, y2 });
    }

    const xmin = Number(tokens[idx++]);
    const ymin = Number(tokens[idx++]);
    const xmax = Number(tokens[idx++]);
    const ymax = Number(tokens[idx++]);
    if ([xmin, ymin, xmax, ymax].some((v) => !Number.isFinite(v))) {
      throw new Error("Invalid rectangle coordinates.");
    }

    let parsedPolygon = null;
    const remaining = tokens.length - idx;
    if (remaining > 0) {
      const mCandidate = Number(tokens[idx]);
      if (
        Number.isInteger(mCandidate) &&
        mCandidate >= 3 &&
        remaining >= 1 + mCandidate * 2
      ) {
        idx++;
        const verts = [];
        for (let i = 0; i < mCandidate; i++) {
          const vx = Number(tokens[idx++]);
          const vy = Number(tokens[idx++]);
          if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
            throw new Error(`Invalid coordinates on polygon vertex ${i + 1}.`);
          }
          verts.push({ x: vx, y: vy });
        }
        parsedPolygon = verts;
      } else if (remaining >= 6 && remaining % 2 === 0) {
        const verts = [];
        while (idx < tokens.length) {
          const vx = Number(tokens[idx++]);
          const vy = Number(tokens[idx++]);
          if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
            throw new Error("Invalid polygon vertex coordinates.");
          }
          verts.push({ x: vx, y: vy });
        }
        parsedPolygon = verts;
      }
    }

    state.segments = parsedSegments;
    state.rect = { xmin, ymin, xmax, ymax };
    els.xminInput.value = fmt(xmin);
    els.yminInput.value = fmt(ymin);
    els.xmaxInput.value = fmt(xmax);
    els.ymaxInput.value = fmt(ymax);

    if (parsedPolygon) {
      state.polygon = parsedPolygon;
      renderPolygonInputs();
      setMode("cyrus-beck");
    } else {
      state.polygon = DEFAULT_POLYGON.map((p) => ({ ...p }));
      renderPolygonInputs();
      setMode("liang-barsky");
    }
  }

  function renderSegmentInputs() {
    els.segmentList.innerHTML = "";
    state.segments.forEach((seg, idx) => {
      const row = document.createElement("div");
      row.className = "row-item segment-row";

      const indexLabel = document.createElement("span");
      indexLabel.className = "row-index";
      indexLabel.textContent = `#${idx + 1}`;
      row.appendChild(indexLabel);

      const fields = ["x1", "y1", "x2", "y2"];
      fields.forEach((key) => {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.value = fmt(seg[key]);
        input.title = `${key} of segment ${idx + 1}`;
        input.addEventListener("change", () => {
          const val = Number(input.value);
          if (Number.isFinite(val)) {
            seg[key] = val;
            syncTextFromState();
            updateScene();
          }
        });
        row.appendChild(input);
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-remove";
      delBtn.textContent = "×";
      delBtn.title = "Remove segment";
      delBtn.addEventListener("click", () => {
        state.segments.splice(idx, 1);
        renderSegmentInputs();
        syncTextFromState();
        updateScene();
      });
      row.appendChild(delBtn);

      els.segmentList.appendChild(row);
    });
  }

  function renderPolygonInputs() {
    els.vertexList.innerHTML = "";
    state.polygon.forEach((pt, idx) => {
      const row = document.createElement("div");
      row.className = "row-item vertex-row";

      const indexLabel = document.createElement("span");
      indexLabel.className = "row-index";
      indexLabel.textContent = `V${idx + 1}`;
      row.appendChild(indexLabel);

      ["x", "y"].forEach((axis) => {
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.value = fmt(pt[axis]);
        input.title = `${axis.toUpperCase()} of vertex ${idx + 1}`;
        input.addEventListener("change", () => {
          const val = Number(input.value);
          if (Number.isFinite(val)) {
            pt[axis] = val;
            syncTextFromState();
            drawCanvas();
          }
        });
        row.appendChild(input);
      });

      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "icon-remove";
      delBtn.textContent = "×";
      delBtn.title = "Remove vertex";
      delBtn.addEventListener("click", () => {
        if (state.polygon.length <= 3) return;
        state.polygon.splice(idx, 1);
        renderPolygonInputs();
        syncTextFromState();
        drawCanvas();
      });
      row.appendChild(delBtn);

      els.vertexList.appendChild(row);
    });
  }

  function worldToScreen(wx, wy) {
    return {
      x: state.view.offsetX + wx * state.view.scale,
      y: state.view.offsetY - wy * state.view.scale,
    };
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - state.view.offsetX) / state.view.scale,
      y: (state.view.offsetY - sy) / state.view.scale,
    };
  }

  function resizeCanvas() {
    const rect = els.wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    els.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    els.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function chooseGridStep(scale) {
    const targetPx = 70;
    const rawStep = targetPx / scale;
    const power = Math.pow(10, Math.floor(Math.log10(Math.max(rawStep, 1e-6))));
    const norm = rawStep / power;
    if (norm < 1.5) return power;
    if (norm < 3.5) return 2 * power;
    if (norm < 7.5) return 5 * power;
    return 10 * power;
  }

  function drawCanvas() {
    resizeCanvas();
    const width = els.canvas.clientWidth;
    const height = els.canvas.clientHeight;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#0c1118";
    ctx.fillRect(0, 0, width, height);

    const step = chooseGridStep(state.view.scale);
    const topLeft = screenToWorld(0, 0);
    const bottomRight = screenToWorld(width, height);

    const minX = Math.floor(topLeft.x / step) * step;
    const maxX = Math.ceil(bottomRight.x / step) * step;
    const minY = Math.floor(bottomRight.y / step) * step;
    const maxY = Math.ceil(topLeft.y / step) * step;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "#17202e";
    ctx.beginPath();
    for (let x = minX; x <= maxX; x += step) {
      const sx = worldToScreen(x, 0).x;
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
    }
    for (let y = minY; y <= maxY; y += step) {
      const sy = worldToScreen(0, y).y;
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
    }
    ctx.stroke();

    const origin = worldToScreen(0, 0);
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(width, origin.y);
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, height);
    ctx.stroke();

    ctx.fillStyle = "#7c8ba1";
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let x = minX; x <= maxX; x += step) {
      if (Math.abs(x) < 1e-9) continue;
      const sx = worldToScreen(x, 0).x;
      const labelY = Math.min(Math.max(origin.y + 4, 4), height - 16);
      ctx.fillText(fmt(x), sx, labelY);
    }

    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let y = minY; y <= maxY; y += step) {
      if (Math.abs(y) < 1e-9) continue;
      const sy = worldToScreen(0, y).y;
      const labelX = Math.max(Math.min(origin.x - 6, width - 8), 32);
      ctx.fillText(fmt(y), labelX, sy);
    }

    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.fillStyle = "rgba(56, 189, 248, 0.11)";
    ctx.lineWidth = 2.2;

    if (state.mode === "liang-barsky") {
      const xmin = Math.min(state.rect.xmin, state.rect.xmax);
      const xmax = Math.max(state.rect.xmin, state.rect.xmax);
      const ymin = Math.min(state.rect.ymin, state.rect.ymax);
      const ymax = Math.max(state.rect.ymin, state.rect.ymax);

      const p1 = worldToScreen(xmin, ymax);
      const p2 = worldToScreen(xmax, ymin);
      const w = p2.x - p1.x;
      const h = p2.y - p1.y;

      ctx.fillRect(p1.x, p1.y, w, h);
      ctx.strokeRect(p1.x, p1.y, w, h);
    } else if (state.polygon.length >= 3) {
      ctx.beginPath();
      state.polygon.forEach((pt, idx) => {
        const sp = worldToScreen(pt.x, pt.y);
        if (idx === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#7dd3fc";
      state.polygon.forEach((pt, idx) => {
        const sp = worldToScreen(pt.x, pt.y);
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillText(`V${idx + 1}`, sp.x + 14, sp.y - 8);
      });
    }
    ctx.restore();

    state.segments.forEach((seg, idx) => {
      const a = worldToScreen(seg.x1, seg.y1);
      const b = worldToScreen(seg.x2, seg.y2);

      ctx.save();
      ctx.strokeStyle = "#f97316";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#fdba74";
      ctx.beginPath();
      ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
      ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(`S${idx + 1}`, a.x + 5, a.y - 4);
      ctx.restore();
    });

    state.segments.forEach((seg) => {
      const res = clipSegment(seg);
      if (!res.visible || !res.segment) return;

      const c1 = worldToScreen(res.segment.x1, res.segment.y1);
      const c2 = worldToScreen(res.segment.x2, res.segment.y2);

      ctx.save();
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(c1.x, c1.y);
      ctx.lineTo(c2.x, c2.y);
      ctx.stroke();

      ctx.fillStyle = "#4ade80";
      ctx.beginPath();
      ctx.arc(c1.x, c1.y, 4.2, 0, Math.PI * 2);
      ctx.arc(c2.x, c2.y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  function fitToView() {
    const width = els.wrapper.clientWidth || 700;
    const height = els.wrapper.clientHeight || 500;

    const pts = [];
    if (state.mode === "liang-barsky") {
      pts.push(
        { x: state.rect.xmin, y: state.rect.ymin },
        { x: state.rect.xmax, y: state.rect.ymax }
      );
    } else {
      state.polygon.forEach((p) => pts.push(p));
    }

    state.segments.forEach((s) => {
      pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
    });

    if (pts.length === 0) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const spanX = Math.max(maxX - minX, 4);
    const spanY = Math.max(maxY - minY, 4);
    const pad = 70;

    const scaleX = (width - pad * 2) / spanX;
    const scaleY = (height - pad * 2) / spanY;
    state.view.scale = Math.max(10, Math.min(200, Math.min(scaleX, scaleY)));

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    state.view.offsetX = width / 2 - midX * state.view.scale;
    state.view.offsetY = height / 2 + midY * state.view.scale;
  }

  function setMode(newMode) {
    state.mode = newMode;
    const isLB = newMode === "liang-barsky";
    els.modeLiangBarsky.classList.toggle("active", isLB);
    els.modeCyrusBeck.classList.toggle("active", !isLB);
    els.rectCard.classList.toggle("hidden", !isLB);
    els.polygonCard.classList.toggle("hidden", isLB);

    updateScene();
  }

  function readRectInputs() {
    const xmin = Number(els.xminInput.value);
    const ymin = Number(els.yminInput.value);
    const xmax = Number(els.xmaxInput.value);
    const ymax = Number(els.ymaxInput.value);
    if ([xmin, ymin, xmax, ymax].every(Number.isFinite)) {
      state.rect = { xmin, ymin, xmax, ymax };
      syncTextFromState();
    }
  }

  function updateScene() {
    drawCanvas();
  }

  function loadPreset() {
    state.rect = { xmin: 2, ymin: 1, xmax: 8, ymax: 6 };
    state.polygon = DEFAULT_POLYGON.map((p) => ({ ...p }));
    state.segments = [
      { x1: 0, y1: 0, x2: 10, y2: 7 },
      { x1: 3, y1: 2, x2: 6, y2: 5 },
      { x1: -2, y1: 6, x2: 1, y2: 9 },
      { x1: 1, y1: 4, x2: 9, y2: 3 },
      { x1: 5, y1: -1, x2: 5, y2: 8 },
      { x1: 0, y1: 7, x2: 11, y2: 6 },
    ];
    els.xminInput.value = fmt(state.rect.xmin);
    els.yminInput.value = fmt(state.rect.ymin);
    els.xmaxInput.value = fmt(state.rect.xmax);
    els.ymaxInput.value = fmt(state.rect.ymax);

    renderSegmentInputs();
    renderPolygonInputs();
    syncTextFromState();
    fitToView();
    updateScene();
  }

  els.modeLiangBarsky.addEventListener("click", () => setMode("liang-barsky"));
  els.modeCyrusBeck.addEventListener("click", () => setMode("cyrus-beck"));

  [els.xminInput, els.yminInput, els.xmaxInput, els.ymaxInput].forEach((input) => {
    input.addEventListener("change", () => {
      readRectInputs();
      updateScene();
    });
  });

  els.addSegmentBtn.addEventListener("click", () => {
    state.segments.push({ x1: 1, y1: 1, x2: 7, y2: 5 });
    renderSegmentInputs();
    syncTextFromState();
    updateScene();
  });

  els.addVertexBtn.addEventListener("click", () => {
    const cx =
      state.polygon.reduce((acc, p) => acc + p.x, 0) / Math.max(1, state.polygon.length);
    const cy =
      state.polygon.reduce((acc, p) => acc + p.y, 0) / Math.max(1, state.polygon.length);
    const last = state.polygon[state.polygon.length - 1] || { x: cx + 2, y: cy };
    const nx = cx + (last.x - cx) * 0.6 - (last.y - cy) * 0.4;
    const ny = cy + (last.x - cx) * 0.4 + (last.y - cy) * 0.6;
    state.polygon.push({ x: Math.round(nx * 10) / 10, y: Math.round(ny * 10) / 10 });
    renderPolygonInputs();
    syncTextFromState();
    updateScene();
  });

  els.parseTextBtn.addEventListener("click", () => {
    try {
      parseTextToState(els.rawDataInput.value);
      renderSegmentInputs();
      fitToView();
      updateScene();
    } catch (err) {
      console.error(err.message);
    }
  });

  els.syncTextBtn.addEventListener("click", () => {
    readRectInputs();
    syncTextFromState();
  });

  els.applyBtn.addEventListener("click", () => {
    readRectInputs();
    updateScene();
  });

  els.loadSampleBtn.addEventListener("click", loadPreset);

  els.fileInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        els.rawDataInput.value = text;
        parseTextToState(text);
        renderSegmentInputs();
        fitToView();
        updateScene();
      } catch (err) {
        console.error(err.message);
      }
      els.fileInput.value = "";
    };
    reader.readAsText(file);
  });

  els.zoomInBtn.addEventListener("click", () => {
    state.view.scale = Math.min(250, state.view.scale * 1.2);
    drawCanvas();
  });

  els.zoomOutBtn.addEventListener("click", () => {
    state.view.scale = Math.max(8, state.view.scale / 1.2);
    drawCanvas();
  });

  els.fitViewBtn.addEventListener("click", () => {
    fitToView();
    drawCanvas();
  });

  els.wrapper.addEventListener("mousedown", (e) => {
    state.view.isPanning = true;
    state.view.lastMouseX = e.clientX;
    state.view.lastMouseY = e.clientY;
  });

  window.addEventListener("mousemove", (e) => {
    const rect = els.wrapper.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    if (sx >= 0 && sy >= 0 && sx <= rect.width && sy <= rect.height) {
      const w = screenToWorld(sx, sy);
      els.coordsHud.textContent = `x: ${w.x.toFixed(2)}, y: ${w.y.toFixed(2)}`;
    }

    if (!state.view.isPanning) return;
    const dx = e.clientX - state.view.lastMouseX;
    const dy = e.clientY - state.view.lastMouseY;
    state.view.lastMouseX = e.clientX;
    state.view.lastMouseY = e.clientY;
    state.view.offsetX += dx;
    state.view.offsetY += dy;
    drawCanvas();
  });

  window.addEventListener("mouseup", () => {
    state.view.isPanning = false;
  });

  els.wrapper.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = els.wrapper.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const before = screenToWorld(sx, sy);

      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      state.view.scale = Math.max(8, Math.min(250, state.view.scale * factor));

      state.view.offsetX = sx - before.x * state.view.scale;
      state.view.offsetY = sy + before.y * state.view.scale;
      drawCanvas();
    },
    { passive: false }
  );

  window.addEventListener("resize", drawCanvas);

  renderSegmentInputs();
  renderPolygonInputs();
  syncTextFromState();
  fitToView();
  updateScene();
})();