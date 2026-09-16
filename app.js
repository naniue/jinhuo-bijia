const STORAGE_KEY = "purchase-price-app-v1";
const PHOTO_DB = "purchase-price-photos";
const PHOTO_STORE = "photos";
const DEFAULT_KINDS = ["手办", "吧唧", "色纸", "立牌", "亚克力", "坐垫", "挂件", "毛绒", "海报", "特典"];
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
};

const state = loadState();
const photoCache = new Map();
let editingId = null;
let draftPhoto = null;
let photoDirty = false;
let filterAnime = "";
let filterKind = "";
const calcCards = {};

function defaultState() {
  return {
    rate: 0.048,
    products: [
      {
        id: crypto.randomUUID(),
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

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function averageSaleInterval(dates) {
  const sorted = sortUniqueDates(dates);
  if (sorted.length < 2) return null;
  let total = 0;
  for (let i = 1; i < sorted.length; i += 1) {
    total += monthIndex(sorted[i]) - monthIndex(sorted[i - 1]);
  }
  return total / (sorted.length - 1);
}

function formatAverageInterval(dates) {
  const avg = averageSaleInterval(dates);
  if (avg == null) return "";
  const text = Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
  return `平均间隔 ${text} 个月`;
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

async function savePhoto(id, dataUrl) {
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

async function getPhoto(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const db = await openPhotoDb();
  const dataUrl = await new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, "readonly");
    const request = tx.objectStore(PHOTO_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  photoCache.set(id, dataUrl);
  return dataUrl;
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

function channelQuote(price, shipping, rate) {
  if (price == null) return null;
  return { price, shipping, yenTotal: price, cny: price * rate };
}

function quotesFromProduct(product, rate) {
  return CHANNELS.map((channel) => ({
    ...channel,
    quote: channelQuote(toNumber(product[channel.id]), channel.shipping, rate),
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
  return Object.fromEntries(
    CHANNELS.map((channel) => [channel.id, toNumber(calcCards[channel.id]?.input.value)])
  );
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
    const quotes = quotesFromProduct(product, rate);
    const best = quotes.find((item) => item.id === bestChannelId(quotes));
    const saleCount = product.saleDates?.length || 0;
    const intervalText = formatAverageInterval(product.saleDates);
    const saleTitle = intervalText
      ? `贩卖${saleCount}次，${intervalText}`
      : `贩卖${saleCount}次`;
    const card = document.createElement("article");
    card.className = "item";
    card.innerHTML = `
      <div class="item-photo-wrap">
        <button type="button" class="item-photo" data-photo>
          <img alt="${escapeHtml(product.name)}" hidden />
          <span class="item-photo-empty">NO IMAGE</span>
        </button>
        ${saleCount ? `<span class="sale-count" title="${escapeHtml(saleTitle)}">${saleCount}</span>` : ""}
      </div>
      <div class="item-body">
        <div class="item-head">
          <span class="tag${best ? " best" : ""}">${best ? `推荐 ${best.name}` : "未比价"}</span>
          <div class="item-actions">
            <button type="button" class="text-btn" data-edit>编辑</button>
            <button type="button" class="text-btn" data-delete>删除</button>
          </div>
        </div>
        <h3>${escapeHtml(product.name)}</h3>
        ${[product.anime, product.kind].filter(Boolean).length ? `<p class="item-cats">${escapeHtml([product.anime, product.kind].filter(Boolean).join(" · "))}</p>` : ""}
        ${product.saleDates?.length ? `<p class="item-sales">${escapeHtml(formatSaleDates(product.saleDates))}${intervalText ? ` · ${intervalText}` : ""}</p>` : ""}
        ${product.note ? `<p class="item-note">${escapeHtml(product.note)}</p>` : ""}
        <p class="item-price">
          <span class="off">不含运费</span>
          <span class="cny">${best ? formatCny(best.quote.cny) : "—"}</span>
        </p>
        <ul class="item-channels"></ul>
      </div>
    `;

    const list = card.querySelector(".item-channels");
    quotes.forEach((item) => {
      const row = document.createElement("li");
      row.className = `${item.id}${item.quote && item.id === best?.id ? " best" : ""}${item.quote ? "" : " empty"}`;
      row.innerHTML = `<span>${item.name}</span><span>${item.quote ? formatCny(item.quote.cny) : "—"}</span>`;
      list.appendChild(row);
    });

    const photoBtn = card.querySelector("[data-photo]");
    const img = photoBtn.querySelector("img");
    const placeholder = photoBtn.querySelector(".item-photo-empty");
    getPhoto(product.id).then((dataUrl) => {
      if (!dataUrl || !photoBtn.isConnected) return;
      img.src = dataUrl;
      img.hidden = false;
      placeholder.hidden = true;
      photoBtn.addEventListener("click", () => openLightbox(dataUrl, product.name));
    });

    card.querySelector("[data-edit]").addEventListener("click", () => openModal(product));
    card.querySelector("[data-delete]").addEventListener("click", async () => {
      if (!confirm(`确定删除「${product.name}」？`)) return;
      state.products = state.products.filter((item) => item.id !== product.id);
      saveState();
      await savePhoto(product.id, null);
      renderLibrary();
    });

    els.productList.appendChild(card);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function openLightbox(src, name) {
  els.lightboxImage.src = src;
  els.lightboxImage.alt = name;
  els.lightbox.showModal();
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
  els.modal.showModal();
  els.form.name.focus();
}

function closeModal() {
  els.modal.close();
  editingId = null;
  photoDirty = false;
  draftPhoto = null;
  showPhotoPreview(null);
}

function readFormProduct() {
  const typed = parseSaleDatesFromNote(els.form.note.value.trim());
  return {
    name: els.form.name.value.trim(),
    anime: els.form.anime.value.trim(),
    kind: els.form.kind.value.trim(),
    note: typed.rest,
    saleDates: sortUniqueDates([...readSaleDates(), ...typed.dates]),
    ...Object.fromEntries(
      CHANNELS.map((channel) => [channel.id, toNumber(els.form[channel.id].value)])
    ),
  };
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

els.rate.value = state.rate;
saveState();
buildCalc();
renderLibrary();

els.rate.addEventListener("input", () => {
  state.rate = Number(els.rate.value) || 0;
  saveState();
  updateCalc();
  renderLibrary();
});

els.search.addEventListener("input", () => {
  renderLibrary();
});
els.sort.addEventListener("change", () => {
  renderLibrary();
});
els.addProduct.addEventListener("click", () => openModal());
els.addSaleDate.addEventListener("click", () => {
  const current = [...els.saleDates.querySelectorAll("input[type=month]")].map((input) => {
    if (!input.value) return {};
    const [year, month] = input.value.split("-").map(Number);
    return { year, month };
  });
  current.push({});
  renderSaleDateFields(current);
});
els.closeModal.addEventListener("click", closeModal);
els.cancelModal.addEventListener("click", closeModal);
els.lightbox.addEventListener("click", () => els.lightbox.close());

els.photoInput.addEventListener("change", (event) => {
  handlePhotoFile(event.target.files[0]);
  event.target.value = "";
});

els.removePhoto.addEventListener("click", () => {
  photoDirty = true;
  showPhotoPreview(null);
});

["dragenter", "dragover"].forEach((type) => {
  els.photoPicker.addEventListener(type, (event) => {
    event.preventDefault();
    els.photoPicker.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((type) => {
  els.photoPicker.addEventListener(type, (event) => {
    event.preventDefault();
    els.photoPicker.classList.remove("is-dragover");
  });
});

els.photoPicker.addEventListener("drop", (event) => {
  handlePhotoFile(event.dataTransfer.files[0]);
});

document.addEventListener("paste", async (event) => {
  const file = fileFromClipboard(event.clipboardData);
  if (!file) return;
  event.preventDefault();
  if (!els.modal.open) await openModal();
  await handlePhotoFile(file, true);
});

els.saveCalc.addEventListener("click", () => {
  const draft = currentCalcProduct();
  if (!bestChannelId(quotesFromProduct(draft, Number(els.rate.value) || 0))) {
    alert("请先至少填写一个渠道的日元价格。");
    return;
  }
  openModal({ ...draft, name: "", note: "", saleDates: [], anime: "", kind: "" });
});

els.form.addEventListener("submit", async (event) => {
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

  const id = editingId || crypto.randomUUID();
  if (editingId) {
    state.products = state.products.map((item) =>
      item.id === editingId ? { ...item, ...draft } : item
    );
  } else {
    state.products.unshift({ id, createdAt: Date.now(), ...draft });
  }

  if (photoDirty || (!editingId && draftPhoto)) {
    await savePhoto(id, draftPhoto);
  }

  saveState();
  closeModal();
  renderLibrary();
});
