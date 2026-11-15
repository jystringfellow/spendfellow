import { JSDOM } from 'jsdom';

export function installDom() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  const window = dom.window;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Document', 'DocumentFragment', 'ShadowRoot', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLFormElement', 'MutationObserver', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'DOMRect', 'AbortController', 'AbortSignal', 'CSSStyleSheet']) {
    Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key as keyof typeof window] });
  }
  for (const key of Object.getOwnPropertyNames(window).filter((key) => /^(HTML|SVG).*Element$/.test(key))) {
    Object.defineProperty(globalThis, key, { configurable: true, value: window[key as keyof typeof window] });
  }
  Object.assign(globalThis, {
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    __UI_SDK_STRICT__: true,
  });
  window.HTMLElement.prototype.showPopover = function () {};
  window.HTMLElement.prototype.hidePopover = function () {};
  window.Element.prototype.getAnimations = () => [];
  window.Element.prototype.scrollIntoView = function () {};
  window.Element.prototype.checkVisibility = () => true;
  window.Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
  window.document.elementFromPoint = () => null;
  window.document.elementsFromPoint = () => [];
  Object.assign(globalThis, { ResizeObserver: class { observe() {} unobserve() {} disconnect() {} } });
  window.matchMedia = (query) => ({ matches: false, media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true });
  window.document.head.append(Object.assign(window.document.createElement('style'), { textContent: '[popover] { display: block !important }' }));
}
