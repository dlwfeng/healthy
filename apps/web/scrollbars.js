/* Capture scroll events once, including dynamically rendered nested scrollers. */
(() => {
  const timers = new WeakMap();
  document.addEventListener('scroll', (event) => {
    const target = event.target === document
      ? document.documentElement
      : event.target;
    if (!target?.classList) return;
    clearTimeout(timers.get(target));
    target.classList.add('scrollbar-visible');
    timers.set(target, setTimeout(() => {
      target.classList.remove('scrollbar-visible');
      timers.delete(target);
    }, 2000));
  }, { capture: true, passive: true });
  // Without JavaScript the themed scrollbar stays visible and usable.
  document.documentElement.classList.add('scrollbars-ready');
})();
