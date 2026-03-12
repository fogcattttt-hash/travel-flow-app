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
  recalcBtn: document.getElementById("recalcBtn"),
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
};

let routes = loadRoutes();
let activeRouteId = routes[0]?.id || null;
let activeWaypointId = null;

let map;
let markers = [];
let polyline;
let directionsService;
let directionsRenderer;

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
  els.totalDistance.textContent = route.metrics?.totalDistance || "-";
  els.totalDuration.textContent = route.metrics?.totalDuration || "-";
  renderDaily(route);
}

function renderDaily(route) {
  const daily = route.metrics?.daily || {};
  const keys = Object.keys(daily).sort((a, b) => Number(a) - Number(b));
  if (!keys.length) {
    els.dailyStats.textContent = "暂无数据";
  } else {
    els.dailyStats.innerHTML = keys
      .map((k) => `<div class="daily-item">第 ${k} 天：在路上 ${formatDuration(daily[k].travelSeconds || 0)} · 停留 ${daily[k].stayHours || 0}h</div>`)
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
      return `<div class="daily-item"><strong>第 ${day} 天</strong><br>${items}</div>`;
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

async function drawRoute() {
  const route = getActiveRoute();
  if (!route) return;

  if (!map) {
    drawFallback(route);
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
    drawFallback(route);
    return;
  }

  try {
    const result = await directionsService.route({
      origin,
      destination,
      waypoints,
      travelMode: google.maps.TravelMode[route.travelMode || "DRIVING"],
      optimizeWaypoints: false,
    });
    directionsRenderer.setDirections(result);

    const legs = result.routes[0]?.legs || [];
    const distance = legs.reduce((s, l) => s + (l.distance?.value || 0), 0);
    const duration = legs.reduce((s, l) => s + (l.duration?.value || 0), 0);

    route.metrics.totalDistance = `${(distance / 1000).toFixed(1)} km`;
    route.metrics.totalDuration = formatDuration(duration);
    route.metrics.daily = calcDailyMetrics(route, legs);
    route.updatedAt = Date.now();
    saveRoutes();
    bindRouteMeta(route);
  } catch (e) {
    console.warn(e);
    drawFallback(route);
  }
}

function drawFallback(route) {
  if (!map) return;
  clearMarkers();

  const points = [];
  route.waypoints.forEach((wp, i) => {
    if (wp.lat && wp.lng) {
      const p = { lat: Number(wp.lat), lng: Number(wp.lng) };
      points.push(p);
      const marker = new google.maps.Marker({ map, position: p, label: `${i + 1}`, title: wp.name || `途经点 ${i + 1}` });
      const infowindow = new google.maps.InfoWindow({ content: `<strong>${wp.name || `途经点 ${i + 1}`}</strong><br>${wp.note || ""}` });
      marker.addListener("click", () => infowindow.open({ anchor: marker, map }));
      markers.push(marker);
    }
  });

  if (polyline) polyline.setMap(null);
  if (points.length >= 2) {
    polyline = new google.maps.Polyline({ path: points, geodesic: true, strokeColor: "#0A84FF", strokeOpacity: 0.9, strokeWeight: 4 });
    polyline.setMap(map);
  }

  if (points.length) {
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds);
  }
}

function clearMarkers() {
  markers.forEach((m) => m.setMap(null));
  markers = [];
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
  directionsRenderer = new google.maps.DirectionsRenderer({ map, suppressMarkers: false });

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
