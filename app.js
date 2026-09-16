const STORAGE_KEY = "purchase-price-app-v1";
const CLOUD_KEY = "purchase-price-cloud-v1";
const PHOTO_DB = "purchase-price-photos";
const PHOTO_STORE = "photos";
const DEFAULT_KINDS = ["LOOKUP", "手办", "吧唧", "色纸", "立牌", "亚克力", "坐垫", "挂件", "毛绒", "海报", "特典"];
const LOOKUP_EXTRA_CNY = 28;
const CHANNELS = [
  { id: "amiami", name: "AmiAmi", shipping: 630 },
  { id: "sootang", name: "Sootang", shipping: 0 },
  { id: "anismile", name: "AniSmile", shipping: 630 },
  { id: "offline", name: "线下", shipping: 0 },
];

const els = {
  rate: document.getElementById("rate"),
  calcGrid: document.getElementById("calc-grid"),
  calcHint: document.getElementById("calc-hint"),
  saveCalc: document.getElementById("save-calc"),
  search: document.getElementById("search"),
  sort: document.getElementById("sort"),
  resultLabel: document.getElementById("result-label"),
  addProduct: document.getElementById("add-product"),
  productList: document.getElementById("product-list"),
  animeFilters: document.getElementById("anime-filters"),
  kindFilters: document.getElementById("kind-filters"),
  animeList: document.getElementById("anime-list"),
  kindList: document.getElementById("kind-list"),
  modal: document.getElementById("product-modal"),
  form: document.getElementById("product-form"),
  modalTitle: document.getElementById("modal-title"),
  closeModal: document.getElementById("close-modal"),
  cancelModal: document.getElementById("cancel-modal"),
  photoPicker: document.getElementById("photo-picker"),
  photoInput: document.getElementById("photo-input"),
  photoPreview: document.getElementById("photo-preview"),
  photoEmpty: document.getElementById("photo-empty"),
  removePhoto: document.getElementById("remove-photo"),
  lightbox: document.getElementById("lightbox"),
  lightboxImage: document.getElementById("lightbox-image"),
  toast: document.getElementById("toast"),
  saleDates: document.getElementById("sale-dates"),
  addSaleDate: document.getElementById("add-sale-date"),
  detailModal: document.getElementById("detail-modal"),
  detailTitle: document.getElementById("detail-title"),
  detailCats: document.getElementById("detail-cats"),
  detailSales: document.getElementById("detail-sales"),
  detailInterval: document.getElementById("detail-interval"),
  detailNote: document.getElementById("detail-note"),
  detailPriceOff: document.getElementById("detail-price-off"),
  detailChannels: document.getElementById("detail-channels"),
  detailPhoto: document.getElementById("detail-photo"),
  detailPhotoEmpty: document.getElementById("detail-photo-empty"),
  detailPhotoBtn: document.getElementById("detail-photo-btn"),
  closeDetail: document.getElementById("close-detail"),
  detailEdit: document.getElementById("detail-edit"),
  detailDelete: document.getElementById("detail-delete"),
  bootError: document.getElementById("boot-error"),
  cloudBtn: document.getElementById("cloud-btn"),
  cloudModal: document.getElementById("cloud-modal"),
  cloudForm: document.getElementById("cloud-form"),
  cloudStatus: document.getElementById("cloud-status"),
  cloudSql: document.getElementById("cloud-sql"),
  cloudUrl: document.getElementById("cloud-url"),
  cloudAnon: document.getElementById("cloud-anon"),
  cloudEmail: document.getElementById("cloud-email"),
  cloudPassword: document.getElementById("cloud-password"),
  closeCloud: document.getElementById("close-cloud"),
  copySql: document.getElementById("copy-sql"),
  cloudLogin: document.getElementById("cloud-login"),
  cloudSignup: document.getElementById("cloud-signup"),
  cloudDisconnect: document.getElementById("cloud-disconnect"),
};

const state = loadState();
const photoCache = new Map();
let editingId = null;
let draftPhoto = null;
let photoDirty = false;
let filterAnime = "";
let filterKind = "";
const calcCards = {};
let detailProduct = null;
let cloudPushTimer = 0;
let cloudBusy = false;

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === "function" && dialog.open) dialog.close();
  else dialog.removeAttribute("open");
}

if (typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal) {
  document.documentElement.classList.add("no-dialog");
}

function defaultState() {
  return {
    rate: 0.048,
    products: [
      {
        id: uid(),
        name: "示例：某比例手办",
        note: "可删除，仅用于演示比价",
        anime: "示例作品",
        kind: "手办",
        saleDates: [{ year: 2024, month: 3 }, { year: 2025, month: 7 }],
        createdAt: Date.now(),
        amiami: 12800,
        sootang: 14200,
        anismile: 12500,
        offline: 15000,
      },
    ],
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const products = Array.isArray(parsed.products)
      ? parsed.products.map(normalizeProduct)
      : [];
    return {
      rate: Number(parsed.rate) || 0.048,
      products,
    };
  } catch {
    return defaultState();
  }
}

function saveState(options) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("saveState", error);
  }
  if (!options || !options.localOnly) scheduleCloudPush();
}

function loadCloudConfig() {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveCloudConfig(partial) {
  const next = Object.assign({}, loadCloudConfig(), partial);
  localStorage.setItem(CLOUD_KEY, JSON.stringify(next));
  return next;
}

function cloudCfg() {
  const saved = loadCloudConfig();
  return {
    url: String(saved.url || window.SUPABASE_URL || "").replace(/\/$/, ""),
    anonKey: saved.anonKey || window.SUPABASE_ANON_KEY || "",
    email: saved.email || "",
    accessToken: saved.accessToken || "",
    refreshToken: saved.refreshToken || "",
    userId: saved.userId || "",
    expiresAt: Number(saved.expiresAt) || 0,
  };
}

function isCloudLoggedIn() {
  const cfg = cloudCfg();
  return Boolean(cfg.url && cfg.anonKey && cfg.accessToken && cfg.userId);
}

function isDemoProduct(product) {
  return product && product.name === "示例：某比例手办";
}

function photoPath(id) {
  return `${cloudCfg().userId}/${id}.jpg`;
}

function updateCloudButton() {
  if (!els.cloudBtn) return;
  if (isCloudLoggedIn()) {
    els.cloudBtn.textContent = "已同步";
    els.cloudBtn.classList.add("is-on");
  } else {
    els.cloudBtn.textContent = "云同步";
    els.cloudBtn.classList.remove("is-on");
  }
}

function setCloudStatus(text) {
  if (els.cloudStatus) els.cloudStatus.textContent = text;
}

async function readApiError(res) {
  try {
    const data = await res.json();
    return data.error_description || data.msg || data.message || data.error || res.statusText;
  } catch {
    return res.statusText || "请求失败";
  }
}

function storeSession(session, extra) {
  const user = session.user || {};
  saveCloudConfig(
    Object.assign(
      {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        userId: user.id || cloudCfg().userId,
        expiresAt: session.expires_at
          ? session.expires_at * 1000
          : Date.now() + (session.expires_in || 3600) * 1000,
      },
      extra || {}
    )
  );
}

async function cloudAuth(path, body) {
  const cfg = cloudCfg();
  const res = await fetch(`${cfg.url}${path}`, {
    method: "POST",
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || data.error || "登录失败");
  return data;
}

async function ensureSession() {
  const cfg = cloudCfg();
  if (!cfg.url || !cfg.anonKey) throw new Error("请先填写 Project URL 和 anon key");
  if (!cfg.accessToken) throw new Error("请先登录");
  if (cfg.expiresAt - 20000 > Date.now()) return;
  if (!cfg.refreshToken) throw new Error("登录已过期，请重新登录");
  const data = await cloudAuth("/auth/v1/token?grant_type=refresh_token", {
    refresh_token: cfg.refreshToken,
  });
  storeSession(data);
}

async function cloudRequest(path, options) {
  await ensureSession();
  const cfg = cloudCfg();
  const headers = Object.assign(
    {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.accessToken}`,
    },
    options && options.headers
  );
  const res = await fetch(`${cfg.url}${path}`, Object.assign({}, options, { headers }));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readApiError(res));
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function productToRow(product) {
  return {
    id: product.id,
    user_id: cloudCfg().userId,
    name: product.name,
    anime: product.anime || "",
    kind: product.kind || "",
    note: product.note || "",
    sale_dates: product.saleDates || [],
    amiami: product.amiami,
    sootang: product.sootang,
    anismile: product.anismile,
    offline: product.offline,
    created_at: new Date(product.createdAt || Date.now()).toISOString(),
    updated_at: new Date(product.updatedAt || product.createdAt || Date.now()).toISOString(),
  };
}

function rowToProduct(row) {
  return normalizeProduct({
    id: row.id,
    name: row.name,
    anime: row.anime,
    kind: row.kind,
    note: row.note,
    saleDates: row.sale_dates,
    amiami: row.amiami == null ? null : Number(row.amiami),
    sootang: row.sootang == null ? null : Number(row.sootang),
    anismile: row.anismile == null ? null : Number(row.anismile),
    offline: row.offline == null ? null : Number(row.offline),
    createdAt: Date.parse(row.created_at) || Date.now(),
    updatedAt: Date.parse(row.updated_at) || Date.now(),
  });
}

async function cloudUpsertProducts(products) {
  const rows = (products || []).filter((item) => !isDemoProduct(item)).map(productToRow);
  if (!rows.length) return;
  await cloudRequest("/rest/v1/products?on_conflict=id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
}

async function cloudFetchProducts() {
  const rows = await cloudRequest("/rest/v1/products?select=*&order=created_at.desc", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return Array.isArray(rows) ? rows.map(rowToProduct) : [];
}

async function cloudDeleteProduct(id) {
  await cloudRequest(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  await cloudSavePhoto(id, null);
}

async function cloudSaveSettings() {
  await cloudRequest("/rest/v1/app_settings?on_conflict=user_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: cloudCfg().userId,
      rate: Number(state.rate) || 0.048,
      updated_at: new Date().toISOString(),
    }),
  });
}

async function cloudFetchSettings() {
  const rows = await cloudRequest("/rest/v1/app_settings?select=rate", {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  return rows && rows[0] ? rows[0] : null;
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取照片失败"));
    reader.readAsDataURL(blob);
  });
}

async function cloudSavePhoto(id, dataUrl) {
  await ensureSession();
  const cfg = cloudCfg();
  const path = photoPath(id);
  if (!dataUrl) {
    await fetch(`${cfg.url}/storage/v1/object/product-photos/${path}`, {
      method: "DELETE",
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.accessToken}`,
      },
    }).catch(() => {});
    return;
  }
  const blob = await dataUrlToBlob(dataUrl);
  const res = await fetch(`${cfg.url}/storage/v1/object/product-photos/${path}`, {
    method: "POST",
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.accessToken}`,
      "Content-Type": blob.type || "image/jpeg",
      "x-upsert": "true",
    },
    body: blob,
  });
  if (!res.ok) throw new Error(await readApiError(res));
}

async function cloudGetPhoto(id) {
  await ensureSession();
  const cfg = cloudCfg();
  const res = await fetch(`${cfg.url}/storage/v1/object/product-photos/${photoPath(id)}`, {
    headers: {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.accessToken}`,
    },
  });
  if (res.status === 400 || res.status === 404) return null;
  if (!res.ok) throw new Error(await readApiError(res));
  return blobToDataUrl(await res.blob());
}

async function pushLocalPhotos() {
  for (let i = 0; i < state.products.length; i += 1) {
    const product = state.products[i];
    if (isDemoProduct(product)) continue;
    const dataUrl = await getPhotoFromIdb(product.id);
    if (dataUrl) await cloudSavePhoto(product.id, dataUrl);
  }
}

function scheduleCloudPush() {
  if (!isCloudLoggedIn() || cloudBusy) return;
  clearTimeout(cloudPushTimer);
  cloudPushTimer = setTimeout(() => {
    syncToCloud().catch((error) => {
      console.warn(error);
      setCloudStatus(error.message || "云同步失败");
    });
  }, 600);
}

async function syncToCloud() {
  if (!isCloudLoggedIn() || cloudBusy) return;
  cloudBusy = true;
  try {
    await ensureSession();
    await cloudSaveSettings();
    updateCloudButton();
  } finally {
    cloudBusy = false;
  }
}

async function pullFromCloud() {
  const remote = await cloudFetchProducts();
  const settings = await cloudFetchSettings();
  if (remote.length) {
    state.products = remote;
  } else {
    await cloudUpsertProducts(state.products);
    await pushLocalPhotos();
  }
  if (settings && settings.rate) state.rate = Number(settings.rate) || state.rate;
  if (els.rate) els.rate.value = state.rate;
  saveState({ localOnly: true });
  if (!remote.length) await cloudSaveSettings();
}

function fillCloudForm() {
  const cfg = cloudCfg();
  if (els.cloudUrl) els.cloudUrl.value = cfg.url;
  if (els.cloudAnon) els.cloudAnon.value = cfg.anonKey;
  if (els.cloudEmail) els.cloudEmail.value = cfg.email;
  setCloudStatus(
    isCloudLoggedIn()
      ? `已登录 ${cfg.email || ""}，商品会保存到云端。`
      : "未连接。登录后，手机和电脑会共用同一份商品。"
  );
}

async function fillCloudSql() {
  if (!els.cloudSql || els.cloudSql.value) return;
  try {
    const res = await fetch("supabase.sql");
    els.cloudSql.value = await res.text();
  } catch {
    els.cloudSql.value = "请打开网站同目录的 supabase.sql 复制到 SQL Editor。";
  }
}

function readCloudForm() {
  const url = (els.cloudUrl.value || "").trim().replace(/\/$/, "");
  const anonKey = (els.cloudAnon.value || "").trim();
  const email = (els.cloudEmail.value || "").trim();
  const password = els.cloudPassword.value || "";
  if (!url || !anonKey) throw new Error("请填写 Project URL 和 anon key");
  if (!email || !password) throw new Error("请填写邮箱和密码");
  saveCloudConfig({ url, anonKey, email });
  return { url, anonKey, email, password };
}

async function connectCloud(mode) {
  try {
    const form = readCloudForm();
    const data =
      mode === "signup"
        ? await cloudAuth("/auth/v1/signup", { email: form.email, password: form.password })
        : await cloudAuth("/auth/v1/token?grant_type=password", {
            email: form.email,
            password: form.password,
          });
    if (!data.access_token) {
      throw new Error("注册成功，请到邮箱点确认后再登录。也可在 Authentication 里关掉 Confirm email。");
    }
    storeSession(data, { url: form.url, anonKey: form.anonKey, email: form.email });
    setCloudStatus("正在同步…");
    await pullFromCloud();
    if (state.products.length) await pushLocalPhotos();
    renderLibrary();
    updateCalc();
    updateCloudButton();
    setCloudStatus(`已登录 ${form.email}，商品已同步到云端。`);
    showToast("云同步已打开");
    if (els.cloudPassword) els.cloudPassword.value = "";
  } catch (error) {
    setCloudStatus(error.message || "连接失败");
    alert(error.message || "连接失败");
  }
}

function disconnectCloud() {
  const cfg = cloudCfg();
  saveCloudConfig({
    url: cfg.url,
    anonKey: cfg.anonKey,
    email: cfg.email,
    accessToken: "",
    refreshToken: "",
    userId: "",
    expiresAt: 0,
  });
  updateCloudButton();
  fillCloudForm();
  showToast("已断开云同步，本机数据还在");
}

async function initCloud() {
  updateCloudButton();
  fillCloudForm();
  if (!isCloudLoggedIn()) return;
  try {
    setCloudStatus("正在从云端拉取…");
    await pullFromCloud();
    renderLibrary();
    updateCalc();
    updateCloudButton();
    setCloudStatus(`已登录 ${cloudCfg().email || ""}，商品已同步。`);
  } catch (error) {
    console.warn(error);
    updateCloudButton();
    setCloudStatus(error.message || "云同步失败，先用本机数据");
    if (els.cloudBtn) els.cloudBtn.textContent = "同步失败";
  }
}

function sortUniqueDates(dates) {
  const seen = new Set();
  return (dates || [])
    .map((item) => ({ year: Number(item.year), month: Number(item.month) }))
    .filter((item) => item.year >= 1990 && item.year <= 2100 && item.month >= 1 && item.month <= 12)
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .filter((item) => {
      const key = `${item.year}-${item.month}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function formatSaleDate(date) {
  return `${date.year}年${String(date.month).padStart(2, "0")}月`;
}

function formatSaleDates(dates) {
  if (!dates?.length) return "";
  if (dates.length === 1) return formatSaleDate(dates[0]);
  return dates.map((date, index) => `第${index + 1}次 ${formatSaleDate(date)}`).join(" / ");
}

function monthIndex(date) {
  return date.year * 12 + date.month;
}

function medianNumber(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function averageSaleInterval(dates) {
  const sorted = sortUniqueDates(dates);
  if (sorted.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < sorted.length; i += 1) {
    gaps.push(monthIndex(sorted[i]) - monthIndex(sorted[i - 1]));
  }
  const kept = gaps.slice().sort((a, b) => a - b);
  while (kept.length >= 2) {
    const longest = kept[kept.length - 1];
    const typical = medianNumber(kept.slice(0, -1));
    if (longest >= typical * 1.5 && longest - typical >= 6) kept.pop();
    else break;
  }
  const total = kept.reduce((sum, gap) => sum + gap, 0);
  return total / kept.length;
}

function formatAverageInterval(dates) {
  const avg = averageSaleInterval(dates);
  if (avg == null) return "";
  const text = Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
  return `再贩间隔 ${text} 个月`;
}

function parseSaleDatesFromNote(note) {
  const raw = String(note || "").trim();
  if (!raw) return { dates: [], rest: "" };

  const hits = [];
  const patterns = [
    /(\d{4})\s*年\s*(\d{1,2})\s*月(?:\s*\d{1,2}\s*日)?/g,
    /(\d{2})\s*年\s*(\d{1,2})\s*月/g,
    /(\d{4})[./\-](\d{1,2})(?:[./\-]\d{1,2})?/g,
  ];

  patterns.forEach((re) => {
    let match;
    while ((match = re.exec(raw))) {
      let year = Number(match[1]);
      const month = Number(match[2]);
      if (year < 100) year += 2000;
      if (year < 1990 || year > 2100 || month < 1 || month > 12) continue;
      const start = match.index;
      const end = start + match[0].length;
      if (hits.some((hit) => start < hit.end && end > hit.start)) continue;
      hits.push({ year, month, start, end });
    }
  });

  hits.sort((a, b) => a.start - b.start);
  let rest = "";
  let cursor = 0;
  hits.forEach((hit) => {
    rest += raw.slice(cursor, hit.start);
    cursor = hit.end;
  });
  rest += raw.slice(cursor);
  rest = rest
    .replace(/[第再]?\s*[一二三四五六七八九十\d]+\s*次(?:贩卖|販賣|发售|發售|再版|贩賣)?/g, " ")
    .replace(/[\/|,;；、·~～-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { dates: sortUniqueDates(hits), rest };
}

function normalizeProduct(product) {
  const parsed = Array.isArray(product.saleDates) && product.saleDates.length
    ? { dates: sortUniqueDates(product.saleDates), rest: product.note || "" }
    : parseSaleDatesFromNote(product.note);
  return {
    ...product,
    anime: (product.anime || "").trim(),
    kind: (product.kind || "").trim(),
    saleDates: parsed.dates,
    note: parsed.rest,
  };
}

function collectNames(key) {
  return [...new Set(state.products.map((item) => (item[key] || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh"));
}

function fillDatalists() {
  const animes = collectNames("anime");
  const kinds = [...new Set([...DEFAULT_KINDS, ...collectNames("kind")])].sort((a, b) =>
    a.localeCompare(b, "zh")
  );
  els.animeList.innerHTML = animes.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  els.kindList.innerHTML = kinds.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function renderChips(container, values, selected, onSelect) {
  container.innerHTML = "";
  values.forEach((value) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `chip${value === selected ? " is-on" : ""}`;
    button.textContent = chipLabel(value);
    button.addEventListener("click", () => onSelect(value));
    container.appendChild(button);
  });
}

function categoryValues(key, selectedOther, otherKey) {
  const names = [
    ...new Set(
      state.products
        .filter((item) => !selectedOther || item[otherKey] === selectedOther)
        .map((item) => (item[key] || "").trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, "zh"));
  const hasEmpty = state.products.some(
    (item) =>
      !(item[key] || "").trim() && (!selectedOther || item[otherKey] === selectedOther)
  );
  return hasEmpty ? [...names, "__none__"] : names;
}

function chipLabel(value) {
  if (value === "__none__") return "未分类";
  return value || "全部";
}

function matchesFilter(value, selected) {
  if (!selected) return true;
  if (selected === "__none__") return !value;
  return value === selected;
}

function latestSaleLabel(dates) {
  const sorted = sortUniqueDates(dates);
  if (!sorted.length) return "";
  return formatSaleDate(sorted[sorted.length - 1]);
}

function latestSaleValue(product) {
  const dates = product.saleDates || [];
  if (!dates.length) return 0;
  const last = dates[dates.length - 1];
  return last.year * 100 + last.month;
}

function monthInputValue(date) {
  if (!date?.year || !date?.month) return "";
  return `${date.year}-${String(date.month).padStart(2, "0")}`;
}

function readSaleDates() {
  return sortUniqueDates(
    [...els.saleDates.querySelectorAll("input[type=month]")].map((input) => {
      if (!input.value) return null;
      const [year, month] = input.value.split("-").map(Number);
      return { year, month };
    }).filter(Boolean)
  );
}

function renderSaleDateFields(dates) {
  const list = dates?.length ? dates : [{}];
  els.saleDates.innerHTML = "";
  list.forEach((date, index) => {
    const row = document.createElement("div");
    row.className = "sale-row";
    row.innerHTML = `
      <span>第${index + 1}次</span>
      <input type="month" value="${monthInputValue(date)}" />
      <button type="button" class="text-btn" data-remove>删除</button>
    `;
    row.querySelector("[data-remove]").addEventListener("click", () => {
      row.remove();
      const current = [...els.saleDates.querySelectorAll(".sale-row")].map((item) => {
        const value = item.querySelector("input").value;
        if (!value) return {};
        const [year, month] = value.split("-").map(Number);
        return { year, month };
      });
      renderSaleDateFields(current.length ? current : [{}]);
    });
    els.saleDates.appendChild(row);
  });
}

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PHOTO_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function savePhotoLocal(id, dataUrl) {
  const db = await openPhotoDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readwrite");
    const store = tx.objectStore(PHOTO_STORE);
    if (dataUrl) store.put(dataUrl, id);
    else store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  photoCache.set(id, dataUrl || null);
}

async function getPhotoFromIdb(id) {
  try {
    const db = await openPhotoDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, "readonly");
      const request = tx.objectStore(PHOTO_STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.warn("getPhoto", error);
    return null;
  }
}

async function savePhoto(id, dataUrl) {
  await savePhotoLocal(id, dataUrl);
  if (isCloudLoggedIn()) {
    try {
      await cloudSavePhoto(id, dataUrl);
    } catch (error) {
      console.warn("cloudSavePhoto", error);
      showToast("照片已保存在本机，云端稍后重试");
    }
  }
}

async function getPhotoLocal(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const dataUrl = await getPhotoFromIdb(id);
  if (dataUrl) photoCache.set(id, dataUrl);
  return dataUrl;
}

async function getPhoto(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const local = await getPhotoFromIdb(id);
  if (local) {
    photoCache.set(id, local);
    return local;
  }
  if (isCloudLoggedIn()) {
    try {
      await ensureSession();
      const remote = await cloudGetPhoto(id);
      photoCache.set(id, remote || null);
      if (remote) await savePhotoLocal(id, remote);
      return remote;
    } catch (error) {
      console.warn("cloudGetPhoto", error);
    }
  }
  photoCache.set(id, null);
  return null;
}

function toNumber(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function formatYen(value) {
  return `${Math.round(value).toLocaleString("ja-JP")}円`;
}

function formatCny(value) {
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isLookupProduct(product) {
  return /lookup/i.test(String((product && product.kind) || ""));
}

function lookupExtraCny(product) {
  return isLookupProduct(product) ? LOOKUP_EXTRA_CNY : 0;
}

function channelQuote(price, shipping, rate, extraCny) {
  if (price == null) return null;
  return { price, shipping, yenTotal: price, cny: price * rate + (extraCny || 0) };
}

function quotesFromProduct(product, rate) {
  const extraCny = lookupExtraCny(product);
  return CHANNELS.map((channel) => ({
    ...channel,
    quote: channelQuote(toNumber(product[channel.id]), channel.shipping, rate, extraCny),
  }));
}

function bestChannelId(quotes) {
  const priced = quotes.filter((item) => item.quote);
  if (!priced.length) return null;
  return priced.reduce((best, item) =>
    item.quote.cny < best.quote.cny ? item : best
  ).id;
}

function bestQuote(product, rate) {
  const quotes = quotesFromProduct(product, rate);
  return quotes.find((item) => item.id === bestChannelId(quotes)) || null;
}

function yenLine(quote) {
  if (!quote) return "暂无标价";
  return formatYen(quote.price);
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    els.toast.hidden = true;
  }, 1800);
}

function fillCalcCard(card, channel, quote, bestId) {
  const empty = !quote;
  card.classList.toggle("best", Boolean(bestId && channel.id === bestId));
  card.querySelector(".yen").textContent = yenLine(quote);
  card.querySelector(".cny").textContent = empty ? "—" : formatCny(quote.cny);
  card.querySelector(".ship").textContent = channel.shipping
    ? `整单运费 ${formatYen(channel.shipping)}，不计入单件`
    : "无单件运费";
  let badge = card.querySelector(".badge");
  if (bestId && channel.id === bestId) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "推荐";
      card.querySelector(".name").appendChild(badge);
    }
  } else if (badge) {
    badge.remove();
  }
}

function currentCalcProduct() {
  const draft = {};
  CHANNELS.forEach((channel) => {
    draft[channel.id] = toNumber(calcCards[channel.id]?.input.value);
  });
  return draft;
}

function buildCalc() {
  els.calcGrid.innerHTML = "";
  CHANNELS.forEach((channel) => {
    const card = document.createElement("article");
    card.className = `calc-card ${channel.id}`;
    card.innerHTML = `
      <p class="name">${channel.name}</p>
      <input type="number" min="0" step="1" placeholder="日元标价" />
      <p class="yen"></p>
      <p class="cny"></p>
      <p class="ship"></p>
    `;
    const input = card.querySelector("input");
    input.addEventListener("input", updateCalc);
    calcCards[channel.id] = { card, input };
    els.calcGrid.appendChild(card);
  });
  updateCalc();
}

function updateCalc() {
  const rate = Number(els.rate.value) || 0;
  const quotes = quotesFromProduct(currentCalcProduct(), rate);
  const bestId = bestChannelId(quotes);
  quotes.forEach((item) => fillCalcCard(calcCards[item.id].card, item, item.quote, bestId));
  const best = quotes.find((item) => item.id === bestId);
  els.calcHint.textContent = best
    ? `当前推荐 ${best.name}，不含运费约 ${formatCny(best.quote.cny)}。`
    : "至少填写一个渠道价格后，会立刻换算人民币并标出推荐。";
}

function showPhotoPreview(dataUrl) {
  draftPhoto = dataUrl;
  els.photoPreview.hidden = !dataUrl;
  els.photoEmpty.hidden = Boolean(dataUrl);
  els.removePhoto.hidden = !dataUrl;
  els.photoPreview.src = dataUrl || "";
}

function filteredProducts() {
  const keyword = els.search.value.trim().toLowerCase();
  const rate = Number(els.rate.value) || 0;
  const products = state.products.filter((product) => {
    const haystack = `${product.name} ${product.note || ""} ${product.anime || ""} ${product.kind || ""} ${formatSaleDates(product.saleDates)}`.toLowerCase();
    return (
      haystack.includes(keyword) &&
      matchesFilter((product.anime || "").trim(), filterAnime) &&
      matchesFilter((product.kind || "").trim(), filterKind)
    );
  });

  products.sort((a, b) => {
    if (els.sort.value === "name") return a.name.localeCompare(b.name, "zh");
    if (els.sort.value === "newest") return (b.createdAt || 0) - (a.createdAt || 0);
    if (els.sort.value === "sale") return latestSaleValue(b) - latestSaleValue(a);
    if (els.sort.value === "reprints") {
      return (
        (b.saleDates?.length || 0) - (a.saleDates?.length || 0) ||
        latestSaleValue(b) - latestSaleValue(a)
      );
    }
    if (els.sort.value === "category") {
      return (
        (a.anime || "未分类").localeCompare(b.anime || "未分类", "zh") ||
        (a.kind || "").localeCompare(b.kind || "", "zh") ||
        a.name.localeCompare(b.name, "zh")
      );
    }
    const aBest = bestQuote(a, rate)?.quote.cny ?? Number.POSITIVE_INFINITY;
    const bBest = bestQuote(b, rate)?.quote.cny ?? Number.POSITIVE_INFINITY;
    return aBest - bBest;
  });
  return products;
}

function renderFilters() {
  const animes = categoryValues("anime", filterKind, "kind");
  const kinds = categoryValues("kind", filterAnime, "anime");
  if (filterAnime && filterAnime !== "__none__" && !animes.includes(filterAnime)) filterAnime = "";
  if (filterKind && filterKind !== "__none__" && !kinds.includes(filterKind)) filterKind = "";

  renderChips(els.animeFilters, ["", ...animes], filterAnime, (value) => {
    filterAnime = value;
    renderLibrary();
  });
  renderChips(els.kindFilters, ["", ...kinds], filterKind, (value) => {
    filterKind = value;
    renderLibrary();
  });
}

function renderLibrary() {
  const keyword = els.search.value.trim();
  const rate = Number(els.rate.value) || 0;
  const products = filteredProducts();
  renderFilters();
  fillDatalists();

  const parts = [
    filterAnime ? chipLabel(filterAnime) : "",
    filterKind ? chipLabel(filterKind) : "",
    keyword,
  ].filter(Boolean);
  els.resultLabel.textContent = parts.length
    ? `「${parts.join(" / ")}」の検索結果(${products.length}件)`
    : `「全部」の検索結果(${state.products.length}件)`;

  els.productList.innerHTML = "";
  if (!products.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = keyword || filterAnime || filterKind ? "没有找到匹配的商品。" : "还没有商品。";
    els.productList.appendChild(empty);
    return;
  }

  products.forEach((product) => {
    const quote = bestQuote(product, rate);
    const shop = quote || CHANNELS.find((channel) => channel.id === "amiami");
    const saleCount = product.saleDates?.length || 0;
    const latest = latestSaleLabel(product.saleDates);
    const intervalText = formatAverageInterval(product.saleDates);
    const saleTitle = intervalText
      ? `贩卖${saleCount}次，${intervalText}`
      : `贩卖${saleCount}次`;
    const card = document.createElement("article");
    card.className = "item";
    card.innerHTML = `
      <div class="item-photo-wrap">
        <div class="item-photo">
          <img alt="${escapeHtml(product.name)}" hidden />
          <span class="item-photo-empty">NO IMAGE</span>
        </div>
        ${saleCount ? `<span class="sale-count" title="${escapeHtml(saleTitle)}">${saleCount}</span>` : ""}
      </div>
      <div class="item-body">
        <div class="item-head">
          <div class="item-actions">
            <button type="button" class="text-btn" data-edit>编辑</button>
            <button type="button" class="text-btn" data-delete>删除</button>
          </div>
        </div>
        <h3>${escapeHtml(product.name)}</h3>
        ${latest ? `<p class="item-sales">${escapeHtml(latest)}</p>` : ""}
        ${intervalText ? `<p class="item-note">${escapeHtml(intervalText)}</p>` : ""}
        <p class="item-shop">${escapeHtml(shop.name)}</p>
        <p class="item-price">
          <span class="cny">${quote ? formatCny(quote.quote.cny) : "—"}</span>
        </p>
      </div>
    `;

    const photoBox = card.querySelector(".item-photo");
    const img = photoBox.querySelector("img");
    const placeholder = photoBox.querySelector(".item-photo-empty");
    getPhoto(product.id).then((dataUrl) => {
      if (!dataUrl || !photoBox.isConnected) return;
      img.src = dataUrl;
      img.hidden = false;
      placeholder.hidden = true;
    });

    card.addEventListener("click", (event) => {
      if (event.target.closest("[data-edit], [data-delete]")) return;
      openDetail(product);
    });
    card.querySelector("[data-edit]").addEventListener("click", (event) => {
      event.stopPropagation();
      openModal(product);
    });
    card.querySelector("[data-delete]").addEventListener("click", async (event) => {
      event.stopPropagation();
      await deleteProduct(product);
    });

    els.productList.appendChild(card);
  });
}

async function deleteProduct(product) {
  if (!product || !confirm(`确定删除「${product.name}」？`)) return;
  state.products = state.products.filter((item) => item.id !== product.id);
  saveState({ localOnly: true });
  try {
    await savePhoto(product.id, null);
  } catch (error) {
    console.warn("savePhoto", error);
  }
  if (isCloudLoggedIn()) {
    try {
      await cloudDeleteProduct(product.id);
    } catch (error) {
      console.warn("cloudDeleteProduct", error);
      showToast("云端删除失败，刷新后再试");
    }
  }
  if (detailProduct?.id === product.id) closeDetail();
  renderLibrary();
}

async function openDetail(product) {
  if (!els.detailModal) return;
  detailProduct = product;
  const rate = Number(els.rate.value) || 0;
  const quotes = quotesFromProduct(product, rate);
  const bestId = bestChannelId(quotes);
  const cats = [product.anime, product.kind].filter(Boolean).join(" · ");
  const intervalText = formatAverageInterval(product.saleDates);
  els.detailTitle.textContent = product.name;
  els.detailCats.textContent = cats;
  els.detailCats.hidden = !cats;
  els.detailSales.textContent = formatSaleDates(product.saleDates);
  els.detailSales.hidden = !(product.saleDates && product.saleDates.length);
  els.detailInterval.textContent = intervalText;
  els.detailInterval.hidden = !intervalText;
  els.detailNote.textContent = product.note || "";
  els.detailNote.hidden = !product.note;
  if (els.detailPriceOff) {
    els.detailPriceOff.textContent = isLookupProduct(product)
      ? `不含运费 · 含 LOOKUP +¥${LOOKUP_EXTRA_CNY}`
      : "不含运费";
  }
  els.detailChannels.innerHTML = "";
  quotes.forEach((item) => {
    const row = document.createElement("li");
    row.className = `${item.id}${item.quote && item.id === bestId ? " best" : ""}${item.quote ? "" : " empty"}`;
    row.innerHTML = `<span>${item.name}</span><span>${item.quote ? formatCny(item.quote.cny) : "—"}</span>`;
    els.detailChannels.appendChild(row);
  });
  els.detailPhoto.hidden = true;
  els.detailPhotoEmpty.hidden = false;
  els.detailPhoto.removeAttribute("src");
  const dataUrl = await getPhoto(product.id);
  if (detailProduct?.id !== product.id) return;
  if (dataUrl) {
    els.detailPhoto.src = dataUrl;
    els.detailPhoto.alt = product.name;
    els.detailPhoto.hidden = false;
    els.detailPhotoEmpty.hidden = true;
  }
  openDialog(els.detailModal);
}

function closeDetail() {
  closeDialog(els.detailModal);
  detailProduct = null;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function openLightbox(src, name) {
  els.lightboxImage.src = src;
  els.lightboxImage.alt = name;
  openDialog(els.lightbox);
}

async function openModal(product) {
  editingId = product?.id || null;
  photoDirty = false;
  els.modalTitle.textContent = product ? "编辑商品" : "添加商品";
  els.form.reset();
  showPhotoPreview(null);
  fillDatalists();
  const draft = product ? normalizeProduct(product) : { saleDates: [], note: "" };
  renderSaleDateFields(draft.saleDates);
  if (product) {
    els.form.name.value = draft.name || "";
    els.form.anime.value = draft.anime || "";
    els.form.kind.value = draft.kind || "";
    els.form.note.value = draft.note || "";
    CHANNELS.forEach((channel) => {
      const value = draft[channel.id];
      els.form[channel.id].value = value == null ? "" : value;
    });
    if (product.id) {
      const existing = await getPhoto(product.id);
      if (editingId === product.id) showPhotoPreview(existing);
    }
  }
  openDialog(els.modal);
  els.form.name.focus();
}

function closeModal() {
  closeDialog(els.modal);
  editingId = null;
  photoDirty = false;
  draftPhoto = null;
  showPhotoPreview(null);
}

function readFormProduct() {
  const typed = parseSaleDatesFromNote(els.form.note.value.trim());
  const draft = {
    name: els.form.name.value.trim(),
    anime: els.form.anime.value.trim(),
    kind: els.form.kind.value.trim(),
    note: typed.rest,
    saleDates: sortUniqueDates([...readSaleDates(), ...typed.dates]),
  };
  CHANNELS.forEach((channel) => {
    draft[channel.id] = toNumber(els.form[channel.id].value);
  });
  return draft;
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type || !file.type.startsWith("image/")) {
      reject(new Error("请选择图片文件"));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 960;
        const scale = Math.min(1, max / img.width, max / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.82;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > 450000 && quality > 0.5) {
          quality -= 0.08;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("图片无法预览"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handlePhotoFile(file, fromPaste = false) {
  if (!file) return;
  try {
    const dataUrl = await compressImage(file);
    photoDirty = true;
    showPhotoPreview(dataUrl);
    if (fromPaste) showToast("已粘贴商品照片");
  } catch (error) {
    alert(error.message || "上传照片失败");
  }
}

function fileFromClipboard(clipboardData) {
  const items = [...(clipboardData?.items || [])];
  const imageItem = items.find((item) => item.type.startsWith("image/"));
  if (imageItem) return imageItem.getAsFile();
  return [...(clipboardData?.files || [])].find((file) => file.type.startsWith("image/")) || null;
}

function bind(el, type, handler) {
  if (el) el.addEventListener(type, handler);
}

function showBootError() {
  if (els.bootError) els.bootError.hidden = false;
}

window.addEventListener("error", showBootError);

try {
  if (els.rate) els.rate.value = state.rate;
  saveState({ localOnly: true });
  buildCalc();
  renderLibrary();
  initCloud();
} catch (error) {
  console.error(error);
  showBootError();
}

bind(els.rate, "input", () => {
  state.rate = Number(els.rate.value) || 0;
  saveState();
  updateCalc();
  renderLibrary();
});
bind(els.search, "input", renderLibrary);
bind(els.sort, "change", renderLibrary);
bind(els.addProduct, "click", () => openModal());
bind(els.cloudBtn, "click", async () => {
  fillCloudForm();
  await fillCloudSql();
  openDialog(els.cloudModal);
});
bind(els.closeCloud, "click", () => closeDialog(els.cloudModal));
bind(els.copySql, "click", async () => {
  await fillCloudSql();
  try {
    await navigator.clipboard.writeText(els.cloudSql.value);
    showToast("SQL 已复制");
  } catch {
    els.cloudSql.select();
    showToast("请手动复制 SQL");
  }
});
bind(els.cloudLogin, "click", () => connectCloud("login"));
bind(els.cloudSignup, "click", () => connectCloud("signup"));
bind(els.cloudDisconnect, "click", disconnectCloud);
bind(els.cloudForm, "submit", (event) => event.preventDefault());
bind(els.addSaleDate, "click", () => {
  const current = [...els.saleDates.querySelectorAll("input[type=month]")].map((input) => {
    if (!input.value) return {};
    const [year, month] = input.value.split("-").map(Number);
    return { year, month };
  });
  current.push({});
  renderSaleDateFields(current);
});
bind(els.closeModal, "click", closeModal);
bind(els.cancelModal, "click", closeModal);
bind(els.lightbox, "click", () => closeDialog(els.lightbox));
bind(els.closeDetail, "click", closeDetail);
bind(els.detailEdit, "click", () => {
  const product = detailProduct;
  closeDetail();
  if (product) openModal(product);
});
bind(els.detailDelete, "click", () => deleteProduct(detailProduct));
bind(els.detailPhotoBtn, "click", () => {
  if (!els.detailPhoto.hidden && els.detailPhoto.src) {
    openLightbox(els.detailPhoto.src, detailProduct?.name || "");
  }
});
bind(els.detailModal, "click", (event) => {
  if (event.target === els.detailModal) closeDetail();
});
bind(els.photoInput, "change", (event) => {
  handlePhotoFile(event.target.files[0]);
  event.target.value = "";
});
bind(els.removePhoto, "click", () => {
  photoDirty = true;
  showPhotoPreview(null);
});

["dragenter", "dragover"].forEach((type) => {
  bind(els.photoPicker, type, (event) => {
    event.preventDefault();
    els.photoPicker.classList.add("is-dragover");
  });
});
["dragleave", "drop"].forEach((type) => {
  bind(els.photoPicker, type, (event) => {
    event.preventDefault();
    els.photoPicker.classList.remove("is-dragover");
  });
});
bind(els.photoPicker, "drop", (event) => {
  handlePhotoFile(event.dataTransfer.files[0]);
});

document.addEventListener("paste", async (event) => {
  const file = fileFromClipboard(event.clipboardData);
  if (!file) return;
  event.preventDefault();
  if (!els.modal?.open) await openModal();
  await handlePhotoFile(file, true);
});

bind(els.saveCalc, "click", () => {
  const draft = currentCalcProduct();
  if (!bestChannelId(quotesFromProduct(draft, Number(els.rate.value) || 0))) {
    alert("请先至少填写一个渠道的日元价格。");
    return;
  }
  openModal({ ...draft, name: "", note: "", saleDates: [], anime: "", kind: "" });
});

bind(els.form, "submit", async (event) => {
  event.preventDefault();
  const draft = readFormProduct();
  if (!draft.name) {
    alert("请填写商品名称。");
    return;
  }
  if (!bestChannelId(quotesFromProduct(draft, Number(els.rate.value) || 0))) {
    alert("请至少填写一个渠道的日元价格。");
    return;
  }

  const id = editingId || uid();
  const now = Date.now();
  if (editingId) {
    state.products = state.products.map((item) =>
      item.id === editingId ? { ...item, ...draft, updatedAt: now } : item
    );
  } else {
    state.products.unshift({ id, createdAt: now, updatedAt: now, ...draft });
  }

  if (photoDirty || (!editingId && draftPhoto)) {
    try {
      await savePhoto(id, draftPhoto);
    } catch (error) {
      console.warn("savePhoto", error);
    }
  }

  saveState();
  if (isCloudLoggedIn()) {
    const saved = state.products.filter((item) => item.id === id)[0];
    try {
      await cloudUpsertProducts(saved ? [saved] : []);
    } catch (error) {
      console.warn(error);
      showToast("商品已保存，云端同步失败");
    }
  }
  closeModal();
  renderLibrary();
});
