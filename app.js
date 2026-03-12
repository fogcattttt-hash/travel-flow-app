const STORAGE_KEY = "travel-flow-routes-v1";
const KEY_STORAGE = "travel-flow-gmaps-key";

const els = {
  routeList: document.getElementById("routeList"),
  newRouteBtn: document.getElementById("newRouteBtn"),
  editorTitle: document.getElementById("editorTitle"),
  routeName: document.getElementById("routeName"),
  start: document.getElementById("start"),
  end: document.getElementById("end"),
  travelDate: document.getElementById("travelDate"),
  routeNote: document.getElementById("routeNote"),
  travelMode: document.getElementById("travelMode"),
  routePreference: document.getElementById("routePreference"),
  recalcBtn: document.getElementById("recalcBtn"),
  guideInput: document.getElementById("guideInput"),
  aiBaseUrl: document.getElementById("aiBaseUrl"),
  aiModel: document.getElementById("aiModel"),
  aiApiKey: document.getElementById("aiApiKey"),
  parseGuideBtn: document.getElementById("parseGuideBtn"),
  addWaypointBtn: document.getElementById("addWaypointBtn"),
  waypointList: document.getElementById("waypointList"),
  saveRouteBtn: document.getElementById("saveRouteBtn"),
  deleteRouteBtn: document.getElementById("deleteRouteBtn"),
  exportBtn: document.getElementById("exportBtn"),
  totalDistance: document.getElementById("totalDistance"),
  totalDuration: document.getElementById("totalDuration"),
  dailyStats: document.getElementById("dailyStats"),
  dailyPlan: document.getElementById("dailyPlan"),
  gmapsKey: document.getElementById("gmapsKey"),
  loadMapBtn: document.getElementById("loadMapBtn"),
  routeAlternative: document.getElementById("routeAlternative"),
};

let routes = loadRoutes();
let activeRouteId = routes[0]?.id || null;
let activeWaypointId = null;

let map;
let markers = [];
let polyline;
let dayPolylines = [];
let directionsService;
let directionsRenderer;
let geocoder;
let routeAlternatives = [];

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function makeRoute() {
  return {
    id: uid(),
    name: "",
    start: "",
    end: "",
    travelDate: "",
    note: "",
    travelMode: "DRIVING",
    routePreference: "BALANCED",
    selectedAlternative: 0,
    waypoints: [],
    metrics: { totalDistance: "-", totalDuration: "-", daily: {} },
    updatedAt: Date.now(),
  };
}

function makeWaypoint() {
  return {
    id: uid(),
    name: "",
    address: "",
    lat: "",
    lng: "",
    stayHours: "",
    day: "1",
    plan: "",
    note: "",
    images: [],
  };
}

function loadRoutes() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRoutes() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
}

function getActiveRoute() {
  return routes.find((r) => r.id === activeRouteId) || null;
}

function setActiveRoute(routeId) {
  activeRouteId = routeId;
  activeWaypointId = getActiveRoute()?.waypoints[0]?.id || null;
  renderAll();
  drawRoute();
}

function renderRouteList() {
  els.routeList.innerHTML = "";
  if (!routes.length) {
    els.routeList.innerHTML = '<p class="hint">还没有路线，先创建一条吧。</p>';
    return;
  }
  routes
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((route) => {
      const item = document.createElement("div");
      item.className = `route-item ${route.id === activeRouteId ? "active" : ""}`;
      item.innerHTML = `<strong>${route.name || "未命名路线"}</strong><small>${route.start || "出发地"} → ${route.end || "目的地"}</small>`;
      item.onclick = () => setActiveRoute(route.id);
      els.routeList.appendChild(item);
    });
}

function bindRouteMeta(route) {
  els.editorTitle.textContent = route.name || "新路线";
  els.routeName.value = route.name;
  els.start.value = route.start;
  els.end.value = route.end;
  els.travelDate.value = route.travelDate;
  els.routeNote.value = route.note;
  els.travelMode.value = route.travelMode || "DRIVING";
  els.routePreference.value = route.routePreference || "BALANCED";
  els.totalDistance.textContent = route.metrics?.totalDistance || "-";
  els.totalDuration.textContent = route.metrics?.totalDuration || "-";
  renderDaily(route);
  renderAlternativeSelect(route);
}

function dayColor(day) {
  const palette = ["#0A84FF", "#FF9F0A", "#30D158", "#BF5AF2", "#FF375F", "#64D2FF", "#FFD60A"];
  return palette[(Number(day) - 1 + palette.length) % palette.length];
}

function renderAlternativeSelect(route) {
  const select = els.routeAlternative;
  select.innerHTML = "";
  if (!routeAlternatives.length) {
    const op = document.createElement("option");
    op.value = "0";
    op.textContent = "主路线";
    select.appendChild(op);
    return;
  }
  routeAlternatives.forEach((r, idx) => {
    const distance = ((r.legs || []).reduce((s, l) => s + (l.distance?.value || 0), 0) / 1000).toFixed(1);
    const duration = formatDuration((r.legs || []).reduce((s, l) => s + (l.duration?.value || 0), 0));
    const op = document.createElement("option");
    op.value = String(idx);
    op.textContent = `方案 ${idx + 1} · ${distance}km · ${duration}`;
    if (idx === (route.selectedAlternative || 0)) op.selected = true;
    select.appendChild(op);
  });
}

function renderDaily(route) {
  const daily = route.metrics?.daily || {};
  const keys = Object.keys(daily).sort((a, b) => Number(a) - Number(b));
  if (!keys.length) {
    els.dailyStats.textContent = "暂无数据";
  } else {
    els.dailyStats.innerHTML = keys
      .map((k) => `<div class="daily-item" style="border-left:4px solid ${dayColor(k)}">第 ${k} 天：在路上 ${formatDuration(daily[k].travelSeconds || 0)} · 停留 ${daily[k].stayHours || 0}h</div>`)
      .join("");
  }

  const grouped = {};
  route.waypoints.forEach((wp, idx) => {
    const day = Number(wp.day || 1);
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push({ ...wp, idx });
  });
  const dayKeys = Object.keys(grouped).sort((a, b) => Number(a) - Number(b));
  if (!dayKeys.length) {
    els.dailyPlan.textContent = "暂无数据";
    return;
  }
  els.dailyPlan.innerHTML = dayKeys
    .map((day) => {
      const items = grouped[day]
        .map((wp) => `#${wp.idx + 1} ${wp.name || wp.address || "未命名途经点"}${wp.plan ? `（${wp.plan}）` : ""}`)
        .join("<br>");
      return `<div class="daily-item" style="border-left:4px solid ${dayColor(day)}"><strong>第 ${day} 天</strong><br>${items}</div>`;
    })
    .join("");
}

function renderWaypoints(route) {
  const tpl = document.getElementById("waypointTpl");
  els.waypointList.innerHTML = "";

  route.waypoints.forEach((wp, i) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.dataset.id = wp.id;
    node.querySelector(".wp-title").textContent = `#${i + 1} ${wp.name || "途经点"}`;

    node.querySelectorAll("[data-f]").forEach((input) => {
      const f = input.dataset.f;
      if (f !== "images") input.value = wp[f] ?? "";
      input.addEventListener("focus", () => (activeWaypointId = wp.id));
      input.addEventListener("input", (e) => {
        if (f === "images") return;
        wp[f] = e.target.value;
        route.updatedAt = Date.now();
        saveRoutes();
        if (f === "name") node.querySelector(".wp-title").textContent = `#${i + 1} ${wp.name || "途经点"}`;
        if (["name", "address", "lat", "lng", "day"].includes(f)) drawRoute();
        if (f === "day") bindRouteMeta(route);
      });

      if (f === "images") {
        input.addEventListener("change", async (e) => {
          const files = Array.from(e.target.files || []);
          const dataUrls = await Promise.all(files.map(fileToDataUrl));
          wp.images.push(...dataUrls);
          route.updatedAt = Date.now();
          renderAll();
        });
      }
    });

    node.querySelector(".remove-waypoint").onclick = () => {
      route.waypoints = route.waypoints.filter((x) => x.id !== wp.id);
      route.updatedAt = Date.now();
      saveRoutes();
      renderAll();
      drawRoute();
    };

    const imgList = node.querySelector(".img-list");
    wp.images.forEach((src, idx) => {
      const img = document.createElement("img");
      img.src = src;
      img.title = "点击删除";
      img.onclick = () => {
        wp.images.splice(idx, 1);
        route.updatedAt = Date.now();
        renderAll();
      };
      imgList.appendChild(img);
    });

    bindDrag(node, route);
    els.waypointList.appendChild(node);
  });
}

function bindDrag(node, route) {
  node.addEventListener("dragstart", () => node.classList.add("dragging"));
  node.addEventListener("dragend", () => {
    node.classList.remove("dragging");
    const ids = Array.from(els.waypointList.children).map((c) => c.dataset.id);
    route.waypoints.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    route.updatedAt = Date.now();
    saveRoutes();
    renderAll();
    drawRoute();
  });

  node.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = document.querySelector(".dragging");
    if (!dragging || dragging === node) return;
    const rect = node.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    els.waypointList.insertBefore(dragging, before ? node : node.nextSibling);
  });
}

function renderEditor() {
  const route = getActiveRoute();
  if (!route) {
    const blank = makeRoute();
    routes.push(blank);
    setActiveRoute(blank.id);
    return;
  }

  bindRouteMeta(route);
  renderWaypoints(route);
}

function renderAll() {
  renderRouteList();
  renderEditor();
}

function bindMetaInput(id, field) {
  els[id].addEventListener("input", (e) => {
    const route = getActiveRoute();
    if (!route) return;
    route[field] = e.target.value;
    route.updatedAt = Date.now();
    if (field === "name") els.editorTitle.textContent = route.name || "新路线";
    saveRoutes();
    renderRouteList();
    if (["start", "end"].includes(field)) drawRoute();
  });
}

function parseWaypointForRouting(wp) {
  if (wp.lat && wp.lng) return { lat: Number(wp.lat), lng: Number(wp.lng) };
  if (wp.address) return wp.address;
  if (wp.name) return wp.name;
  return null;
}

function calcDailyMetrics(route, legs) {
  const daily = {};
  route.waypoints.forEach((wp) => {
    const day = Number(wp.day || 1);
    if (!daily[day]) daily[day] = { travelSeconds: 0, stayHours: 0 };
    daily[day].stayHours += Number(wp.stayHours || 0);
  });

  route.waypoints.forEach((wp, idx) => {
    if (idx === 0) return;
    const day = Number(wp.day || 1);
    if (!daily[day]) daily[day] = { travelSeconds: 0, stayHours: 0 };
    daily[day].travelSeconds += legs[idx - 1]?.duration?.value || 0;
  });
  return daily;
}

async function renderColoredWaypointMarkers(route) {
  clearMarkers();
  const points = [];
  for (let i = 0; i < route.waypoints.length; i++) {
    const wp = route.waypoints[i];
    let p = null;
    if (wp.lat && wp.lng) p = { lat: Number(wp.lat), lng: Number(wp.lng) };
    else p = await geocodeText(wp.address || wp.name);
    if (!p) continue;
    points.push({ p, wp, i });
    const day = Number(wp.day || 1);
    const marker = new google.maps.Marker({
      map,
      position: p,
      label: `${i + 1}`,
      title: wp.name || `途经点 ${i + 1}`,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: dayColor(day),
        fillOpacity: 1,
        strokeColor: "#fff",
        strokeWeight: 2,
      },
    });
    const infowindow = new google.maps.InfoWindow({ content: `<strong>${wp.name || `途经点 ${i + 1}`}</strong><br>第${day}天<br>${wp.note || ""}` });
    marker.addListener("click", () => infowindow.open({ anchor: marker, map }));
    markers.push(marker);
  }
  return points;
}

async function drawRoute() {
  const route = getActiveRoute();
  if (!route) return;

  if (!map) {
    await drawFallback(route);
    return;
  }

  clearMarkers();

  const innerStops = route.waypoints.map(parseWaypointForRouting).filter(Boolean);
  let origin = route.start?.trim();
  let destination = route.end?.trim();

  if (!origin && innerStops.length) origin = innerStops[0];
  if (!destination && innerStops.length) destination = innerStops[innerStops.length - 1];

  let waypoints = route.waypoints.map(parseWaypointForRouting).filter(Boolean).map((x) => ({ location: x, stopover: true }));
  if (!route.start && waypoints.length) waypoints = waypoints.slice(1);
  if (!route.end && waypoints.length) waypoints = waypoints.slice(0, -1);

  if (!origin || !destination) {
    await drawFallback(route);
    return;
  }

  if (JSON.stringify(origin) === JSON.stringify(destination) && waypoints.length <= 1) {
    await drawFallback(route);
    return;
  }

  try {
    const result = await directionsService.route({
      origin,
      destination,
      waypoints,
      travelMode: google.maps.TravelMode[route.travelMode || "DRIVING"],
      optimizeWaypoints: false,
      provideRouteAlternatives: true,
      drivingOptions: route.routePreference === "LESS_TIME" ? { departureTime: new Date(), trafficModel: "bestguess" } : undefined,
      avoidHighways: route.routePreference === "LESS_DISTANCE",
    });

    routeAlternatives = result.routes || [];
    const altIndex = Math.min(route.selectedAlternative || 0, Math.max(routeAlternatives.length - 1, 0));
    route.selectedAlternative = altIndex;
    directionsRenderer.setDirections(result);
    directionsRenderer.setRouteIndex(altIndex);

    const chosen = routeAlternatives[altIndex] || routeAlternatives[0];
    const legs = chosen?.legs || [];
    const distance = legs.reduce((s, l) => s + (l.distance?.value || 0), 0);
    const duration = legs.reduce((s, l) => s + (l.duration?.value || 0), 0);

    const coloredPoints = await renderColoredWaypointMarkers(route);
    const dayPoints = {};
    coloredPoints.forEach(({ p, wp }) => {
      const day = Number(wp.day || 1);
      if (!dayPoints[day]) dayPoints[day] = [];
      dayPoints[day].push(p);
    });
    drawDayLinesFromPoints(dayPoints);

    route.metrics.totalDistance = `${(distance / 1000).toFixed(1)} km`;
    route.metrics.totalDuration = formatDuration(duration);
    route.metrics.daily = calcDailyMetrics(route, legs);
    route.updatedAt = Date.now();
    saveRoutes();
    bindRouteMeta(route);
  } catch (e) {
    console.warn(e);
    await drawFallback(route);
  }
}

async function geocodeText(text) {
  if (!geocoder || !text) return null;
  try {
    const r = await geocoder.geocode({ address: text });
    const loc = r.results?.[0]?.geometry?.location;
    if (!loc) return null;
    return { lat: loc.lat(), lng: loc.lng() };
  } catch {
    return null;
  }
}

async function drawFallback(route) {
  if (!map) return;
  clearMarkers();
  clearDayPolylines();

  const points = [];
  const dayPoints = {};
  for (let i = 0; i < route.waypoints.length; i++) {
    const wp = route.waypoints[i];
    let p = null;
    if (wp.lat && wp.lng) {
      p = { lat: Number(wp.lat), lng: Number(wp.lng) };
    } else {
      p = await geocodeText(wp.address || wp.name);
    }

    if (p) {
      points.push(p);
      const day = Number(wp.day || 1);
      if (!dayPoints[day]) dayPoints[day] = [];
      dayPoints[day].push(p);
      const marker = new google.maps.Marker({
        map,
        position: p,
        label: `${i + 1}`,
        title: wp.name || `途经点 ${i + 1}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: dayColor(day),
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });
      const infowindow = new google.maps.InfoWindow({ content: `<strong>${wp.name || `途经点 ${i + 1}`}</strong><br>第${day}天<br>${wp.note || ""}` });
      marker.addListener("click", () => infowindow.open({ anchor: marker, map }));
      markers.push(marker);
    }
  }

  drawDayLinesFromPoints(dayPoints);

  if (points.length === 1) {
    map.setCenter(points[0]);
    map.setZoom(12);
  } else if (points.length) {
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds);
  }
}

function clearMarkers() {
  markers.forEach((m) => m.setMap(null));
  markers = [];
}

function clearDayPolylines() {
  dayPolylines.forEach((p) => p.setMap(null));
  dayPolylines = [];
  if (polyline) polyline.setMap(null);
}

function drawDayLinesFromPoints(dayPointsMap) {
  clearDayPolylines();
  Object.keys(dayPointsMap).forEach((day) => {
    const pts = dayPointsMap[day] || [];
    if (pts.length < 2) return;
    const p = new google.maps.Polyline({
      path: pts,
      geodesic: true,
      strokeColor: dayColor(day),
      strokeOpacity: 0.95,
      strokeWeight: 4,
    });
    p.setMap(map);
    dayPolylines.push(p);
  });
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h ? `${h}h ` : ""}${m}m`;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function parseGuideHeuristic(text) {
  const lines = text.split(/\n+/).map((x) => x.trim()).filter(Boolean);
  let day = 1;
  const waypoints = [];
  const dayReg = /^(d|day)\s*([0-9]+)/i;
  for (const line of lines) {
    const m = line.match(dayReg) || line.match(/^第\s*([0-9]+)\s*天/);
    if (m) {
      day = Number(m[2] || m[1] || day);
      continue;
    }
    if (line.length < 2) continue;
    const parts = line.split(/[->→-]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) {
      parts.forEach((p) => waypoints.push({ ...makeWaypoint(), name: p, address: p, day: String(day), plan: "攻略导入" }));
    } else {
      waypoints.push({ ...makeWaypoint(), name: line, address: line, day: String(day), plan: "攻略导入" });
    }
  }
  return waypoints;
}

async function parseGuideWithLLM(text) {
  const baseUrl = els.aiBaseUrl.value.trim();
  const model = els.aiModel.value.trim();
  const apiKey = els.aiApiKey.value.trim();
  if (!baseUrl || !model || !apiKey) return null;

  const prompt = `你是旅游行程抽取器。把输入攻略转成JSON数组，每项字段: day(数字), name, address, plan。只返回JSON，不要解释。输入:\n${text}`;
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`LLM请求失败: ${res.status}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(content);
  const arr = Array.isArray(parsed) ? parsed : parsed.items || [];
  return arr.map((x) => ({
    ...makeWaypoint(),
    day: String(Number(x.day || 1)),
    name: x.name || x.address || "",
    address: x.address || x.name || "",
    plan: x.plan || "攻略导入",
  }));
}

function attachEvents() {
  bindMetaInput("routeName", "name");
  bindMetaInput("start", "start");
  bindMetaInput("end", "end");
  bindMetaInput("travelDate", "travelDate");
  bindMetaInput("routeNote", "note");

  els.travelMode.addEventListener("change", (e) => {
    const route = getActiveRoute();
    route.travelMode = e.target.value;
    route.updatedAt = Date.now();
    saveRoutes();
    drawRoute();
  });

  els.routePreference.addEventListener("change", (e) => {
    const route = getActiveRoute();
    route.routePreference = e.target.value;
    route.selectedAlternative = 0;
    route.updatedAt = Date.now();
    saveRoutes();
    drawRoute();
  });

  els.routeAlternative.addEventListener("change", () => {
    const route = getActiveRoute();
    route.selectedAlternative = Number(els.routeAlternative.value || 0);
    route.updatedAt = Date.now();
    saveRoutes();
    if (routeAlternatives.length) {
      directionsRenderer.setRouteIndex(route.selectedAlternative);
    }
    bindRouteMeta(route);
  });

  els.newRouteBtn.onclick = () => {
    const route = makeRoute();
    routes.push(route);
    saveRoutes();
    setActiveRoute(route.id);
  };

  els.addWaypointBtn.onclick = () => {
    const route = getActiveRoute();
    route.waypoints.push(makeWaypoint());
    route.updatedAt = Date.now();
    saveRoutes();
    renderAll();
    drawRoute();
  };

  els.saveRouteBtn.onclick = () => {
    const route = getActiveRoute();
    route.updatedAt = Date.now();
    saveRoutes();
    renderAll();
    drawRoute();
    alert("路线已保存到浏览器本地存储");
  };

  els.deleteRouteBtn.onclick = () => {
    const route = getActiveRoute();
    if (!route) return;
    if (!confirm(`确定删除「${route.name || "未命名路线"}」吗？`)) return;
    routes = routes.filter((r) => r.id !== route.id);
    saveRoutes();
    activeRouteId = routes[0]?.id || null;
    renderAll();
    drawRoute();
  };

  els.exportBtn.onclick = () => {
    const route = getActiveRoute();
    const blob = new Blob([JSON.stringify(route, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${route.name || "travel-route"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  els.recalcBtn.onclick = drawRoute;

  els.parseGuideBtn.onclick = async () => {
    const text = els.guideInput.value.trim();
    if (!text) return alert("请先粘贴攻略内容");
    const route = getActiveRoute();
    try {
      const llm = await parseGuideWithLLM(text);
      const items = llm?.length ? llm : parseGuideHeuristic(text);
      if (!items.length) return alert("未解析到有效行程点，请换一段更结构化的文本");
      route.waypoints.push(...items);
      route.updatedAt = Date.now();
      saveRoutes();
      renderAll();
      drawRoute();
      alert(`已导入 ${items.length} 个途经点`);
    } catch (e) {
      console.warn(e);
      const items = parseGuideHeuristic(text);
      if (!items.length) return alert("解析失败，请检查模型配置或文本格式");
      route.waypoints.push(...items);
      route.updatedAt = Date.now();
      saveRoutes();
      renderAll();
      drawRoute();
      alert(`模型解析失败，已用本地解析导入 ${items.length} 个途经点`);
    }
  };

  els.gmapsKey.value = localStorage.getItem(KEY_STORAGE) || "";
  els.loadMapBtn.onclick = async () => {
    const key = els.gmapsKey.value.trim();
    if (!key) return alert("请先填写 Google Maps API Key");
    localStorage.setItem(KEY_STORAGE, key);
    await initGoogleMap(key);
    drawRoute();
  };
}

async function initGoogleMap(key) {
  if (!window.google?.maps) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&language=zh-CN`;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Google Maps 加载失败"));
      document.head.appendChild(script);
    });
  }

  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 31.2304, lng: 121.4737 },
    zoom: 4,
    mapTypeControl: false,
    fullscreenControl: false,
    streetViewControl: false,
  });

  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ map, suppressMarkers: true, preserveViewport: false });
  geocoder = new google.maps.Geocoder();

  map.addListener("click", (e) => {
    const route = getActiveRoute();
    if (!route?.waypoints.length) return;
    const target = route.waypoints.find((w) => w.id === activeWaypointId) || route.waypoints[route.waypoints.length - 1];
    target.lat = e.latLng.lat().toFixed(6);
    target.lng = e.latLng.lng().toFixed(6);
    route.updatedAt = Date.now();
    saveRoutes();
    renderAll();
    drawRoute();
  });
}

function bootstrap() {
  if (!routes.length) {
    routes.push(makeRoute());
    activeRouteId = routes[0].id;
    saveRoutes();
  }

  attachEvents();
  renderAll();

  const key = localStorage.getItem(KEY_STORAGE);
  if (key) {
    initGoogleMap(key)
      .then(drawRoute)
      .catch(() => {
        document.getElementById("map").innerHTML = '<p style="padding:16px;color:#687080">Google Maps 加载失败，请检查 key 或网络后重试。</p>';
      });
  } else {
    document.getElementById("map").innerHTML = '<p style="padding:16px;color:#687080">输入 Google Maps API Key 后点击「加载地图」。</p>';
  }
}

bootstrap();
