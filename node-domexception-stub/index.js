if (typeof globalThis.DOMException === 'undefined') {
  globalThis.DOMException = (() => {
    try { atob(0) } catch (err) { return err.constructor }
  })();
}
module.exports = globalThis.DOMException;
