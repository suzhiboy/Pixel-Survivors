/* 无头冒烟测试：用假 DOM/Canvas 把 index.html 里那段 IIFE 真跑起来，
 * 然后手动推进若干帧，覆盖本次平衡调整改到的每一条代码路径。
 * 只做运行时验证，不改任何游戏文件。 */
import { readFileSync } from "node:fs";

/* ---------------- 假 DOM ---------------- */
const noop = () => {};
function makeCtx() {
  const special = {
    measureText: () => ({ width: 0 }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    createImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    isPointInPath: () => false,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    getLineDash: () => []
  };
  const store = {};
  return new Proxy(store, {
    get(t, k) {
      if (k in special) return special[k];
      if (k in t) return t[k];
      if (typeof k === "symbol") return undefined;
      return noop;                       // 其余方法一律空实现
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function makeEl(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    style: { setProperty: noop, removeProperty: noop, getPropertyValue: () => "" },
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    dataset: {}, children: [], textContent: "", value: "",
    width: 480, height: 270, title: "", hidden: false, disabled: false,
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    setAttribute: noop, removeAttribute: noop, getAttribute: () => null,
    addEventListener: noop, removeEventListener: noop, dispatchEvent: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 480, bottom: 270, width: 480, height: 270, x: 0, y: 0 }),
    getContext: () => (el._ctx || (el._ctx = makeCtx())),
    querySelector: () => null, querySelectorAll: () => [],
    getElementsByTagName: () => [], focus: noop, blur: noop, click: noop,
    closest: () => null, contains: () => false, scrollIntoView: noop
  };
  // innerHTML 要真的模拟浏览器：赋空串 = 清空子节点，否则测试数出来的 children 会一直累加
  let _html = "";
  Object.defineProperty(el, "innerHTML", {
    get() { return _html; },
    set(v) { _html = String(v); if (_html === "") el.children.length = 0; },
    enumerable: true, configurable: true
  });
  return el;
}
const elCache = new Map();
const document = {
  getElementById(id) {
    if (!elCache.has(id)) elCache.set(id, makeEl(id === "cv" ? "canvas" : "div"));
    return elCache.get(id);
  },
  createElement: (t) => makeEl(t),
  querySelector: () => makeEl("div"),
  querySelectorAll: () => [],
  getElementsByTagName: () => [],
  addEventListener: noop, removeEventListener: noop,
  body: makeEl("body"), documentElement: makeEl("html"),
  fonts: { add: noop, ready: Promise.resolve() },
  hidden: false, visibilityState: "visible", hasFocus: () => true
};
const storage = { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; },
                  setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }, clear() { this._d = {}; } };
class AudioContext {
  constructor() { this.state = "running"; this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
  resume() { return Promise.resolve(); }
  createOscillator() { return { type: "", frequency: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop },
                                connect: noop, start: noop, stop: noop, disconnect: noop, onended: null }; }
  createGain() { return { gain: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop },
                          connect: noop, disconnect: noop }; }
  createBiquadFilter() { return { type: "", frequency: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop },
                                  Q: { value: 0 }, connect: noop, disconnect: noop }; }
  createBufferSource() { return { buffer: null, connect: noop, start: noop, stop: noop, disconnect: noop }; }
  createBuffer(c, l) { return { length: l, getChannelData: () => new Float32Array(l) }; }
  createDynamicsCompressor() { return { connect: noop, disconnect: noop }; }
}
class Image { constructor() { this.src = ""; this.width = 1; this.height = 1; this.onload = null; } }
const win = {
  document, localStorage: storage, sessionStorage: storage,
  AudioContext, webkitAudioContext: AudioContext, Image,
  innerWidth: 1280, innerHeight: 720, devicePixelRatio: 2,
  location: { href: "file:///index.html", search: "", hash: "", protocol: "file:" },
  navigator: { userAgent: "node-smoke", maxTouchPoints: 0, language: "zh-CN" },
  matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
  addEventListener: noop, removeEventListener: noop,
  requestAnimationFrame: noop, cancelAnimationFrame: noop,
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  performance: { now: () => Date.now() },
  getComputedStyle: () => ({ getPropertyValue: () => "" }),
  screen: { width: 1280, height: 720 }, isSecureContext: true,
  ontouchstart: undefined
};
win.window = win;

/* ---------------- 抠出脚本并导出内部符号 ---------------- */
const html = readFileSync("index.html", "utf8");
const m = /<script\b[^>]*>([\s\S]*?)<\/script>/i.exec(html);
if (!m) throw new Error("找不到 <script> 块");
let code = m[1];
const tail = code.lastIndexOf("})();");
if (tail < 0) throw new Error("找不到 IIFE 结尾");
// 在 IIFE 内部挂一个导出钩子（用 eval 取名字，缺哪个就跳过哪个，不让整段挂掉）
const hook = `
  ;globalThis.__DUT = (function () {
    const names = ["G","frame","startGame","reset","giveWeapon","stats","ST","PASSIVES","WEAPONS",
      "ENEMIES","HEROES","MAP_KEYS","DIFFS","buildOptions","chooseUpgrade","openLevelUp","hurtPlayer","spawnEnemy",
      "pickSpawn","currentPool","ensureBeam","updateBeams","updateWeapons","update","render",
      "buildHelp","buildData","weaponSlots","penOf","damage","explode","ATMOST",
      "query","rebuildGrid","grid","CELL","nearestEnemy","curST","maxHpOf","ARMOR_CAP","updateZones"];
    const o = {};
    for (let i = 0; i < names.length; i++) { try { o[names[i]] = eval(names[i]); } catch (e) { o[names[i]] = undefined; } }
    return o;
  })();
`;
code = code.slice(0, tail) + hook + code.slice(tail);

const fn = new Function("window", "document", "localStorage", "sessionStorage",
                        "requestAnimationFrame", "cancelAnimationFrame", "AudioContext",
                        "webkitAudioContext", "Image", "navigator", "performance",
                        "matchMedia", "getComputedStyle", "setTimeout", "setInterval", "screen",
                        "location", "globalThis", code);
fn(win, document, storage, storage, noop, noop, AudioContext, AudioContext, Image,
   win.navigator, win.performance, win.matchMedia, win.getComputedStyle, () => 0, () => 0,
   win.screen, win.location, globalThis);

const D = globalThis.__DUT;
globalThis.__DOC = document;          // 让测试能读 buildHelp() 写进 DOM 的说明文案
globalThis.__WIN = win;
const missing = Object.keys(D).filter((k) => D[k] === undefined);
console.log("导出符号缺失：", missing.length ? missing.join(", ") : "（无）");
if (!D.G || !D.frame || !D.startGame) throw new Error("核心符号没导出，冒烟测试无法进行");
export const DUT = D;
