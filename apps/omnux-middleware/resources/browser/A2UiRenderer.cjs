// 브라우저 컨텍스트에서 실행한다. 선언형 메시지를 DOM과 로컬 데이터로 변환하며 HTML을 실행하지 않는다.
function renderA2Ui(messages) {
  const previous = window.__omnuxA2ui || { surfaces: {} };
  const next = JSON.parse(JSON.stringify(previous));
  const components = new Set(["Text", "Image", "Icon", "Video", "AudioPlayer", "Row", "Column", "List", "Card", "Tabs", "Divider", "Modal", "Button", "CheckBox", "TextField", "DateTimeInput", "ChoicePicker", "Slider"]);
  const protectedKeys = new Set(["__proto__", "prototype", "constructor"]);
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
  function pointer(path, scope = "") {
    if (typeof path !== "string") throw new Error("data path must be a string");
    const absolute = path.startsWith("/") ? path : scope + "/" + path;
    const parts = absolute.split("/").slice(1).map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"));
    if (parts.some(part => protectedKeys.has(part))) throw new Error("reserved data path");
    return path === "" && !scope ? [] : parts;
  }
  function read(model, path, scope) {
    return pointer(path, scope).reduce((current, part) => current != null && Object.hasOwn(current, part) ? current[part] : undefined, model);
  }
  function write(surface, path, value, scope = "") {
    const parts = pointer(path, scope);
    if (!parts.length) { surface.data = value === undefined ? {} : value; return; }
    if (!object(surface.data) && !Array.isArray(surface.data)) surface.data = {};
    let current = surface.data;
    for (const part of parts.slice(0, -1)) {
      if (!Object.hasOwn(current, part) || (!object(current[part]) && !Array.isArray(current[part]))) current[part] = {};
      current = current[part];
    }
    const last = parts[parts.length - 1];
    if (value === undefined) delete current[last]; else current[last] = value;
  }
  function value(raw, surface, scope = "") {
    if (!object(raw)) return raw;
    if (typeof raw.path === "string") return read(surface.data, raw.path, scope);
    if (raw.call) {
      const args = Object.fromEntries(Object.entries(raw.args || {}).map(([key, item]) => [key, Array.isArray(item) ? item.map(part => value(part, surface, scope)) : value(item, surface, scope)]));
      switch (raw.call) {
        case "required": return args.value !== null && args.value !== undefined && args.value !== "" && args.value !== false && (!Array.isArray(args.value) || args.value.length > 0);
        case "email": return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(args.value || ""));
        case "regex": return new RegExp(String(args.pattern)).test(String(args.value ?? ""));
        case "length": return String(args.value ?? "").length >= (args.min ?? 0) && String(args.value ?? "").length <= (args.max ?? Infinity);
        case "numeric": return Number.isFinite(Number(args.value)) && Number(args.value) >= (args.min ?? -Infinity) && Number(args.value) <= (args.max ?? Infinity);
        case "and": return args.values.every(Boolean);
        case "or": return args.values.some(Boolean);
        case "not": return !args.value;
        case "formatString": return String(args.value ?? args.template ?? "").replace(/\$\{([^}]+)\}/g, (_, path) => String(read(surface.data, path, scope) ?? ""));
        case "formatNumber": return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: args.maximumFractionDigits ?? 3 }).format(Number(args.value));
        case "formatCurrency": return new Intl.NumberFormat("ko-KR", { style: "currency", currency: args.currency || "USD" }).format(Number(args.value));
        default: throw new Error(`unsupported A2UI function: ${raw.call}`);
      }
    }
    return Object.fromEntries(Object.entries(raw).map(([key, item]) => [key, value(item, surface, scope)]));
  }
  function safeUrl(raw) {
    if (typeof raw !== "string" || !/^https?:\/\//i.test(raw)) throw new Error("A2UI URL must use http/https");
    return new URL(raw).href;
  }
  if (!Array.isArray(messages) || !messages.length) throw new Error("A2UI messages are required");
  for (const message of messages) {
    if (!object(message) || !["v0.9", "v0.9.1"].includes(message.version)) throw new Error("A2UI version must be v0.9 or v0.9.1");
    const keys = ["createSurface", "updateComponents", "updateDataModel", "deleteSurface"].filter(key => Object.hasOwn(message, key));
    if (keys.length !== 1) throw new Error("A2UI message requires exactly one action");
    const kind = keys[0], payload = message[kind], id = payload?.surfaceId;
    if (typeof id !== "string" || !id || protectedKeys.has(id)) throw new Error("invalid A2UI surfaceId");
    if (kind === "createSurface") {
      if (Object.hasOwn(next.surfaces, id)) throw new Error("A2UI surface already exists");
      if (!/^https:\/\/a2ui\.org\/specification\/v0_9(?:_1)?\/catalogs\/basic\/catalog\.json$/.test(payload.catalogId || "")) throw new Error("unsupported A2UI catalog");
      next.surfaces[id] = { data: {}, components: {}, sendDataModel: payload.sendDataModel === true };
    } else {
      if (!Object.hasOwn(next.surfaces, id)) throw new Error("A2UI surface does not exist");
      const surface = next.surfaces[id];
      if (kind === "deleteSurface") delete next.surfaces[id];
      if (kind === "updateDataModel") write(surface, payload.path ?? "", Object.hasOwn(payload, "value") ? payload.value : undefined);
      if (kind === "updateComponents") {
        if (!Array.isArray(payload.components) || !payload.components.length) throw new Error("A2UI components are required");
        for (const component of payload.components) {
          if (!object(component) || typeof component.id !== "string" || !component.id || protectedKeys.has(component.id)) throw new Error("invalid A2UI component id");
          if (!components.has(component.component)) throw new Error(`unsupported A2UI component: ${component.component}`);
          surface.components[component.id] = component;
        }
      }
    }
  }
  const root = document.createElement("main");
  root.id = "omnux-canvas";
  function refresh() {
    const focused = document.activeElement;
    const binding = focused?.dataset.binding;
    const start = focused?.selectionStart, end = focused?.selectionEnd;
    window.__omnuxA2ui = next;
    const surfaceId = Object.keys(next.surfaces)[0];
    renderA2Ui([{ version: "v0.9.1", updateDataModel: { surfaceId, value: next.surfaces[surfaceId].data } }]);
    if (binding) {
      const input = document.querySelector(`[data-binding="${CSS.escape(binding)}"]`);
      input?.focus();
      if (typeof start === "number" && input?.setSelectionRange) input.setSelectionRange(start, end);
    }
  }
  function build(surfaceId, id, scope = "", parents = []) {
    const surface = next.surfaces[surfaceId], descriptor = surface.components[id];
    if (!descriptor) return document.createDocumentFragment();
    if (parents.includes(id)) throw new Error("A2UI component tree contains a cycle");
    const children = [...parents, id], kind = descriptor.component;
    const resolve = item => value(item, surface, scope);
    let element = document.createElement("div");
    const child = childId => build(surfaceId, childId, scope, children);
    const text = item => String(resolve(item) ?? "");
    if (["Row", "Column", "List"].includes(kind)) {
      element.className = `layout ${kind.toLowerCase()}`;
      const items = descriptor.children || [];
      if (Array.isArray(items)) items.forEach(item => element.append(child(item)));
      else {
        const list = read(surface.data, items.path, scope);
        if (Array.isArray(list)) list.forEach((_, index) => element.append(build(surfaceId, items.componentId, (items.path.startsWith("/") ? items.path : scope + "/" + items.path) + "/" + index, children)));
      }
    } else if (kind === "Text") {
      const tag = /^(h[1-6])$/.test(descriptor.variant) ? descriptor.variant : "p";
      element = document.createElement(tag); element.textContent = text(descriptor.text); element.className = "text";
    } else if (kind === "Card") { element.className = "card"; element.append(child(descriptor.child)); }
    else if (kind === "Divider") element = document.createElement("hr");
    else if (kind === "Icon") {
      const name = text(descriptor.name);
      const icons = { mail: "✉", search: "⌕", home: "⌂", check: "✓", close: "×", add: "+", remove: "−", info: "ⓘ", warning: "⚠", help: "?", settings: "⚙", menu: "☰", star: "☆", favorite: "♥", delete: "⌫" };
      if (name && !Object.hasOwn(icons, name)) throw new Error(`unsupported A2UI icon: ${name}`);
      element = document.createElement("span"); element.textContent = icons[name] || ""; element.setAttribute("role", "img"); element.setAttribute("aria-label", name);
    }
    else if (["Image", "Video", "AudioPlayer"].includes(kind)) {
      element = document.createElement(kind === "Image" ? "img" : kind === "Video" ? "video" : "audio");
      element.src = safeUrl(resolve(descriptor.url));
      if (kind === "Image") element.alt = text(descriptor.alt ?? descriptor.description);
      else element.controls = true;
    } else if (kind === "Button") {
      element = document.createElement("button"); element.type = "button";
      if (descriptor.child) element.append(child(descriptor.child)); else element.textContent = text(descriptor.text);
      const action = descriptor.action;
      if (!action?.event?.name && action?.functionCall?.call !== "openUrl") throw new Error("button requires a supported action");
      element.addEventListener("click", () => {
        if (action.functionCall) window.open(safeUrl(resolve(action.functionCall.args.url)), "_blank", "noopener,noreferrer");
        else window.__omnuxCanvasAction({ version: "v0.9.1", action: { surfaceId, sourceComponentId: id, name: action.event.name, context: resolve(action.event.context || {}), timestamp: new Date().toISOString() }, ...(surface.sendDataModel ? { dataModel: surface.data } : {}) });
      });
    } else if (["TextField", "CheckBox", "Slider", "DateTimeInput"].includes(kind)) {
      element = document.createElement("label"); element.textContent = text(descriptor.label);
      const input = document.createElement(descriptor.variant === "longText" ? "textarea" : "input");
      input.type = kind === "CheckBox" ? "checkbox" : kind === "Slider" ? "range" : kind === "DateTimeInput" ? "datetime-local" : descriptor.variant === "obscured" ? "password" : descriptor.variant === "number" ? "number" : "text";
      if (kind === "CheckBox") input.checked = Boolean(resolve(descriptor.value)); else input.value = text(descriptor.value);
      if (kind === "Slider") { input.min = descriptor.min ?? 0; input.max = descriptor.max ?? 100; input.step = "any"; }
      input.dataset.binding = `${surfaceId}:${scope}:${id}`;
      input.addEventListener("input", () => {
        if (descriptor.value?.path === undefined) descriptor.value = input.type === "checkbox" ? input.checked : input.value;
        else write(surface, descriptor.value.path, input.type === "checkbox" ? input.checked : input.type === "range" || input.type === "number" ? Number(input.value) : input.value, scope);
        refresh();
      });
      element.append(input);
    } else if (kind === "ChoicePicker") {
      element = document.createElement("label"); element.textContent = text(descriptor.label);
      const select = document.createElement("select"); select.multiple = descriptor.variant !== "mutuallyExclusive";
      const selected = resolve(descriptor.value) || [];
      for (const option of descriptor.options || []) { const node = document.createElement("option"); node.value = option.value; node.textContent = text(option.label); node.selected = selected.includes(option.value); select.append(node); }
      select.dataset.binding = `${surfaceId}:${scope}:${id}`;
      select.addEventListener("change", () => { if (descriptor.value?.path !== undefined) write(surface, descriptor.value.path, [...select.selectedOptions].map(option => option.value), scope); refresh(); });
      element.append(select);
    } else if (kind === "Tabs") {
      const header = document.createElement("div"), panel = document.createElement("div");
      header.className = "layout row"; header.setAttribute("role", "tablist");
      const tabs = descriptor.tabs || [];
      tabs.forEach((tab, index) => { const button = document.createElement("button"); button.type = "button"; button.textContent = text(tab.title); button.setAttribute("role", "tab"); button.setAttribute("aria-selected", String(index === 0)); button.onclick = () => { for (const item of header.children) item.setAttribute("aria-selected", String(item === button)); panel.replaceChildren(child(tab.child)); }; header.append(button); });
      if (tabs[0]) panel.append(child(tabs[0].child)); element.append(header, panel);
    } else if (kind === "Modal") {
      const trigger = child(descriptor.trigger), dialog = document.createElement("dialog");
      const close = document.createElement("button"); close.textContent = "닫기"; close.onclick = () => dialog.close();
      dialog.append(child(descriptor.content), close); element.append(trigger, dialog); element.addEventListener("click", event => { if (!dialog.open && !dialog.contains(event.target)) dialog.showModal(); });
    }
    element.dataset.componentId = id;
    const failures = (descriptor.checks || []).filter(check => !resolve(check.condition || check));
    if (kind === "Button") element.disabled = failures.length > 0;
    if (failures.length && kind !== "Button") { const error = document.createElement("small"); error.textContent = failures.map(check => check.message).join(" · "); element.append(error); }
    return element;
  }
  for (const [id, surface] of Object.entries(next.surfaces)) { const section = document.createElement("section"); section.dataset.surfaceId = id; if (surface.components.root) section.append(build(id, "root")); root.append(section); }
  const style = document.createElement("style");
  style.textContent = "*{box-sizing:border-box}body{margin:0;padding:24px;font:16px/1.6 system-ui;color:#202124;background:white;overflow-wrap:anywhere}main,section,.layout{min-width:0}.layout{display:flex;align-items:stretch}.row{flex-direction:row;flex-wrap:wrap}.column,.list{flex-direction:column}.layout>*{min-width:0;flex:1}p,h1,h2,h3,img,button,label,.card,hr,video,audio,span{margin:8px}.card{padding:16px;border:1px solid #ddd;border-radius:12px}label{display:grid;gap:6px}input,select,textarea,button{font:inherit;max-width:100%;padding:9px;border:1px solid #ccc;border-radius:8px;background:white;color:inherit}button{cursor:pointer}input[type=checkbox]{width:18px;height:18px}img,video,audio{max-width:calc(100% - 16px)}img{height:auto}dialog{max-width:calc(100vw - 32px);max-height:80vh;border:1px solid #ddd;border-radius:12px}small{color:#a22020}pre{white-space:pre-wrap}hr{border:0;border-top:1px solid #ddd}:focus-visible{outline:2px solid #4667c9;outline-offset:2px}";
  document.head.querySelector("style[data-omnux]")?.remove(); style.dataset.omnux = "a2ui"; document.head.append(style);
  document.body.replaceChildren(root);
  window.__omnuxA2ui = next;
  return { surfaces: Object.keys(next.surfaces), components: Object.values(next.surfaces).reduce((sum, surface) => sum + Object.keys(surface.components).length, 0) };
}
