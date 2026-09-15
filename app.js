const STORAGE_KEY = "purchase-price-app-v1";
const PHOTO_DB = "purchase-price-photos";
const PHOTO_STORE = "photos";
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
  addProduct: document.getElementById("add-product"),
  productList: document.getElementById("product-list"),
  libraryCount: document.getElementById("library-count"),
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
};

const state = loadState();
const photoCache = new Map();
let editingId = null;
let draftPhoto = null;
let photoDirty = false;
const calcCards = {};

function defaultState() {
  return {
    rate: 0.048,
    products: [
      {
        id: crypto.randomUUID(),
        name: "示例：某比例手办",
        note: "可删除，仅用于演示比价",
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
    return {
      rate: Number(parsed.rate) || 0.048,
      products: Array.isArray(parsed.products) ? parsed.products : [],
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

function formatCny(value) {
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function channelQuote(price, shipping, rate) {
  if (price == null) return null;
  const yenTotal = price + shipping;
  return { price, shipping, yenTotal, cny: yenTotal * rate };
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

function yenLine(quote) {
  if (!quote) return "暂无标价";
  if (quote.shipping) {
    return `${formatYen(quote.price)} + ${formatYen(quote.shipping)} = ${formatYen(quote.yenTotal)}`;
  }
  return `标价 ${formatYen(quote.price)}`;
}

function fillChannelCard(card, channel, quote, bestId) {
  const empty = !quote;
  card.classList.toggle("empty-channel", empty);
  card.classList.toggle("best", Boolean(bestId && channel.id === bestId));
  card.querySelector(".yen").textContent = yenLine(quote);
  card.querySelector(".cny").textContent = empty ? "—" : formatCny(quote.cny);
  card.querySelector(".ship").textContent = channel.shipping
    ? `含运费 ${formatYen(channel.shipping)}`
    : "无额外运费";

  let badge = card.querySelector(".badge");
  if (bestId && channel.id === bestId) {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = "推荐";
      card.appendChild(badge);
    }
  } else if (badge) {
    badge.remove();
  }
}

function createChannelCard(channel, quote, bestId, options = {}) {
  const card = document.createElement("article");
  card.className = `channel-card ${channel.id}`;
  card.innerHTML = `
    <p class="name">${channel.name}</p>
    ${options.editable ? `<input type="number" min="0" step="1" placeholder="日元标价" />` : ""}
    <p class="yen"></p>
    <p class="cny"></p>
    <p class="ship"></p>
  `;
  fillChannelCard(card, channel, quote, bestId);
  return card;
}

function currentCalcProduct() {
  return Object.fromEntries(
    CHANNELS.map((channel) => [channel.id, toNumber(calcCards[channel.id]?.input.value)])
  );
}

function buildCalc() {
  els.calcGrid.innerHTML = "";
  CHANNELS.forEach((channel) => {
    const card = createChannelCard(channel, null, null, { editable: true });
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

  quotes.forEach((item) => {
    fillChannelCard(calcCards[item.id].card, item, item.quote, bestId);
  });

  const best = quotes.find((item) => item.id === bestId);
  els.calcHint.textContent = best
    ? `当前推荐 ${best.name}，到货成本约 ${formatCny(best.quote.cny)}。`
    : "至少填写一个渠道价格后，会立刻换算人民币并标出推荐。";
}

function showPhotoPreview(dataUrl) {
  draftPhoto = dataUrl;
  els.photoPreview.hidden = !dataUrl;
  els.photoEmpty.hidden = Boolean(dataUrl);
  els.removePhoto.hidden = !dataUrl;
  els.photoPreview.src = dataUrl || "";
}

function renderLibrary() {
  const keyword = els.search.value.trim().toLowerCase();
  const rate = Number(els.rate.value) || 0;
  const products = state.products.filter((product) => {
    const haystack = `${product.name} ${product.note || ""}`.toLowerCase();
    return haystack.includes(keyword);
  });

  els.libraryCount.textContent = state.products.length
    ? `共 ${state.products.length} 件商品，按人民币到货成本比价。`
    : "还没有商品，先试算一组价格再保存。";

  els.productList.innerHTML = "";
  if (!products.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = keyword ? "没有找到匹配的商品。" : "商品库是空的。";
    els.productList.appendChild(empty);
    return;
  }

  products.forEach((product) => {
    const quotes = quotesFromProduct(product, rate);
    const bestId = bestChannelId(quotes);
    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-top">
        <div class="product-identity">
          <button type="button" class="product-photo" data-photo hidden>
            <img alt="${escapeHtml(product.name)}" />
          </button>
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <p class="note">${escapeHtml(product.note || "无备注")}</p>
          </div>
        </div>
        <div class="product-actions">
          <button type="button" class="text-btn" data-edit>编辑</button>
          <button type="button" class="text-btn" data-delete>删除</button>
        </div>
      </div>
    `;

    const row = document.createElement("div");
    row.className = "channel-row";
    quotes.forEach((item) => {
      row.appendChild(createChannelCard(item, item.quote, bestId));
    });
    card.appendChild(row);

    const photoBtn = card.querySelector("[data-photo]");
    getPhoto(product.id).then((dataUrl) => {
      if (!dataUrl || !photoBtn.isConnected) return;
      photoBtn.hidden = false;
      photoBtn.querySelector("img").src = dataUrl;
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
  if (product) {
    els.form.name.value = product.name || "";
    els.form.note.value = product.note || "";
    CHANNELS.forEach((channel) => {
      const value = product[channel.id];
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
  return {
    name: els.form.name.value.trim(),
    note: els.form.note.value.trim(),
    ...Object.fromEntries(
      CHANNELS.map((channel) => [channel.id, toNumber(els.form[channel.id].value)])
    ),
  };
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
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

async function handlePhotoFile(file) {
  if (!file) return;
  try {
    const dataUrl = await compressImage(file);
    photoDirty = true;
    showPhotoPreview(dataUrl);
  } catch (error) {
    alert(error.message || "上传照片失败");
  }
}

els.rate.value = state.rate;
buildCalc();
renderLibrary();

els.rate.addEventListener("input", () => {
  state.rate = Number(els.rate.value) || 0;
  saveState();
  updateCalc();
  renderLibrary();
});

els.search.addEventListener("input", renderLibrary);
els.addProduct.addEventListener("click", () => openModal());
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

els.saveCalc.addEventListener("click", () => {
  const draft = currentCalcProduct();
  if (!bestChannelId(quotesFromProduct(draft, Number(els.rate.value) || 0))) {
    alert("请先至少填写一个渠道的日元价格。");
    return;
  }
  openModal({ ...draft, name: "", note: "" });
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
    state.products.unshift({ id, ...draft });
  }

  if (photoDirty || (!editingId && draftPhoto)) {
    await savePhoto(id, draftPhoto);
  }

  saveState();
  closeModal();
  renderLibrary();
});
