/* One export pipeline; each view supplies its existing DOM scope and metadata. */
(() => {
  const frames = new WeakMap();
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paths = {
    share: '<path d="M12 16V3m-4 4 4-4 4 4M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M5 16v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    retry: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  function button({ title, context = '', disabled = false }) {
    return `<button type="button" class="icon-button share-trigger" data-share data-share-title="${escape(title)}" data-share-context="${escape(context)}" aria-label="分享${escape(title)}" title="分享${escape(title)}" ${disabled ? 'disabled' : ''}>${icon('share')}</button>`;
  }
  let dialog, preview, status, retry, download, nativeShare;
  let sequence = 0, result, trigger, busy = false;
  function release() {
    sequence++;
    if (result) URL.revokeObjectURL(result.url);
    result = null;
    preview.replaceChildren();
    trigger?.focus({ preventScroll: true });
  }
  function setup() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.className = 'share-dialog';
    dialog.setAttribute('aria-labelledby', 'share-dialog-title');
    dialog.innerHTML = `<header class="share-dialog-head"><h2 id="share-dialog-title">长图预览</h2><button class="icon-button" type="button" data-share-close aria-label="关闭预览" title="关闭预览">${icon('close')}</button></header><div class="share-preview"></div><footer class="share-dialog-footer"><p role="status" aria-live="polite"></p><div class="share-dialog-actions"><button class="icon-button" type="button" data-share-retry aria-label="重新生成图片" title="重新生成图片" hidden>${icon('retry')}</button><button class="icon-button" type="button" data-share-download aria-label="保存图片" title="保存图片" disabled>${icon('download')}</button><button class="icon-button" type="button" data-share-native aria-label="系统分享" title="系统分享" hidden>${icon('share')}</button></div></footer>`;
    document.body.append(dialog);
    preview = dialog.querySelector('.share-preview');
    status = dialog.querySelector('[role="status"]');
    retry = dialog.querySelector('[data-share-retry]');
    download = dialog.querySelector('[data-share-download]');
    nativeShare = dialog.querySelector('[data-share-native]');
    dialog.querySelector('[data-share-close]').onclick = () => dialog.close();
    dialog.addEventListener('close', release);
    dialog.addEventListener('click', e => {
      if (e.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) dialog.close();
    });
    retry.onclick = () => { if (trigger?.isConnected) void open(trigger); else status.textContent = '页面已更新，请关闭后重新选择分享内容。'; };
    download.onclick = () => {
      if (!result) return;
      const link = document.createElement('a');
      link.href = result.url;
      link.download = result.name;
      document.body.append(link);
      link.click();
      link.remove();
    };
    nativeShare.onclick = async () => {
      if (!result || busy) return;
      busy = true;
      nativeShare.disabled = true;
      try {
        await navigator.share({ files: [result.file], title: result.title });
      } catch (error) {
        if (error.name !== 'AbortError') status.textContent = '分享未完成，可以保存图片后分享。';
      } finally {
        busy = false;
        nativeShare.disabled = false;
      }
    };
  }
  async function loadedImage(image) {
    image.loading = 'eager';
    try { await image.decode(); } catch { throw Error('图片未能加载，请稍后重试。'); }
    if (!image.naturalWidth) throw Error('图片未能加载，请稍后重试。');
  }
  async function ready(root) {
    await root.ownerDocument.fonts.ready;
    await Promise.all([...root.querySelectorAll('img')].map(loadedImage));
  }
  function removeActiveContent(root) {
    root.querySelectorAll('script,object,embed,form,base,meta[http-equiv="refresh"]').forEach(n => n.remove());
    for (const node of root.querySelectorAll('*')) {
      for (const attr of [...node.attributes]) {
        if (/^on/i.test(attr.name) || /^(javascript|vbscript):/i.test(attr.value.trim())) node.removeAttribute(attr.name);
      }
    }
  }
  function timeout(promise, message, milliseconds = 30000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(message)), milliseconds); })]).finally(() => clearTimeout(timer));
  }
  function inlineSvgStyles(root) {
    // SVG descendants are cloned as a subtree by html-to-image. Resolve their
    // stylesheet rules first, otherwise paths can fall back to solid black.
    const properties = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity', 'opacity', 'color', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'paint-order', 'visibility', 'display'];
    for (const node of root.querySelectorAll('svg, svg *')) {
      const computed = node.ownerDocument.defaultView.getComputedStyle(node);
      for (const property of properties) node.style.setProperty(property, computed.getPropertyValue(property));
    }
  }
  async function renderReport(frame, source) {
    // The displayed report remains sandboxed. Only a script-free, non-networked
    // copy gets same-origin access inside the disposable capture frame.
    const parsed = new DOMParser().parseFromString(source, 'text/html');
    removeActiveContent(parsed);
    parsed.querySelectorAll('iframe,link').forEach(n => n.remove());
    parsed.documentElement.dataset.theme = 'light';
    const policy = parsed.createElement('meta');
    policy.httpEquiv = 'Content-Security-Policy';
    policy.content = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; script-src 'none'; base-uri 'none'; form-action 'none'";
    parsed.head.prepend(policy);
    frame.setAttribute('sandbox', 'allow-same-origin');
    const load = new Promise(resolve => frame.addEventListener('load', resolve, { once: true }));
    frame.srcdoc = '<!doctype html>' + parsed.documentElement.outerHTML;
    await timeout(load, '报告加载超时，请重试。');
    const doc = frame.contentDocument;
    if (!doc?.body) throw Error('报告正文暂时无法读取。');
    await ready(doc.body);
    doc.querySelectorAll('details').forEach(n => { n.open = true; });
    frame.style.height = Math.ceil(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight)) + 'px';
    // Rasterize the isolated document once so its CSS cannot affect the page.
    const width = Math.ceil(Math.max(doc.body.scrollWidth, frame.clientWidth));
    const height = Math.ceil(Math.max(doc.body.scrollHeight, doc.body.getBoundingClientRect().height));
    const pixelRatio = ratio(width, height);
    inlineSvgStyles(doc.body);
    const canvas = await window.htmlToImage.toCanvas(doc.body, { width, height, pixelRatio, skipFonts: true });
    const image = frame.ownerDocument.createElement('img');
    image.src = canvas.toDataURL('image/png');
    image.alt = '健康报告正文';
    image.style.cssText = `display:block;width:100%;height:auto;aspect-ratio:${width}/${height}`;
    frame.replaceWith(image);
    await loadedImage(image);
  }
  function ratio(width, height) {
    const value = Math.min(2, 16000 / Math.max(width, height), Math.sqrt(24000000 / (width * height)));
    if (value < 0.5) throw Error('内容过长，请选择较小的范围后分享。');
    return value;
  }
  async function capture(scope, options) {
    if (!window.htmlToImage) throw Error('图片工具尚未就绪，请刷新页面重试。');
    const clone = scope.cloneNode(true);
    const canvases = [...scope.querySelectorAll('canvas')];
    const canvasCopies = [...clone.querySelectorAll('canvas')];
    canvases.forEach((canvas, i) => {
      // Canvas pixels keep the live theme while the rest of the export is light;
      // the palette stays legible on white. Redraw if exact theme parity is needed.
      const image = document.createElement('img');
      image.src = canvas.toDataURL('image/png');
      image.alt = '';
      image.style.cssText = 'display:block;width:100%;height:100%';
      canvasCopies[i].replaceWith(image);
    });
    const originals = [...scope.querySelectorAll('iframe')];
    const copies = [...clone.querySelectorAll('iframe')];
    const reportCopies = copies.map((frame, i) => [frame, frames.get(originals[i])]);
    if (reportCopies.some(([, source]) => !source)) throw Error('正文尚未就绪，请稍后重试。');
    copies.forEach(frame => { frame.removeAttribute('srcdoc'); frame.removeAttribute('src'); });
    removeActiveContent(clone);
    clone.querySelectorAll('[data-share-note]').forEach(node => {
      const note = document.createElement('p');
      note.className = 'share-image-note';
      note.textContent = node.textContent;
      node.remove();
      clone.append(note);
    });
    clone.querySelectorAll('[data-share]').forEach(n => {
      // Keep a hidden placeholder for layouts using :last-child / grid columns.
      const placeholder = document.createElement('span');
      placeholder.hidden = true;
      n.replaceWith(placeholder);
    });
    clone.querySelectorAll('[data-share-hide], .context-chat-action, .rp-reading-actions, .chat-tool-row, .rc-original, [popover], .meal-single-share, .meal-energy-info, .meal-trend-switch, .segmented').forEach(n => n.remove());
    if (clone.matches('details')) clone.open = true;
    clone.querySelectorAll('details').forEach(n => { n.open = true; });
    const stage = document.createElement('iframe');
    stage.className = 'share-capture-frame';
    stage.title = '生成分享图片';
    stage.setAttribute('aria-hidden', 'true');
    stage.setAttribute('sandbox', 'allow-same-origin');
    const width = Math.ceil(Math.min(1100, Math.max(720, scope.getBoundingClientRect().width + 56)));
    stage.style.width = width + 'px';
    document.body.append(stage);
    try {
      const doc = stage.contentDocument;
      doc.documentElement.lang = 'zh-CN';
      doc.documentElement.dataset.theme = 'light';
      const styles = [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => {
        const copy = doc.createElement('link');
        copy.rel = 'stylesheet';
        copy.href = link.href;
        const loaded = new Promise((resolve, reject) => {
          copy.onload = resolve;
          copy.onerror = () => reject(Error('分享样式加载失败，请重试。'));
        });
        doc.head.append(copy);
        return loaded;
      });
      const sheet = doc.createElement('style');
      sheet.textContent = 'html{scrollbar-gutter:auto}body{margin:0;background:#fff}.share-capture{padding:28px;background:#fff;color:var(--text)}.share-capture-content{display:flow-root;min-width:0}.share-capture-content>[data-share-scope]{width:100%;max-width:none;margin:0}.share-capture [data-share-only]{display:block}.share-capture :is(.meal-table-scroll,.data-table-scroll,pre){max-height:none;overflow:visible}.share-capture :is(.meal-summary-sub,.meal-summary-heading strong){white-space:normal;overflow:visible;-webkit-line-clamp:unset}.share-capture .training-item-toggle{pointer-events:none}.share-capture .training-item-chevron,.share-capture .meal-entry-toggle{visibility:hidden}.share-capture .chat-message.user{margin:0 0 24px}.share-capture .meal-day-summary{position:static}.share-capture :is(.meal-trend-switch,.segmented){pointer-events:none}.share-capture *{animation:none!important;transition:none!important;caret-color:transparent!important}';
      doc.head.append(sheet);
      const root = doc.createElement('article');
      root.className = 'share-capture';
      root.innerHTML = `<header class="share-image-head"><div><img src="${location.origin}/assets/brand/healthy.svg" alt="" width="28" height="28"><strong>healthy</strong></div><span>${escape(options.context)}</span></header><div class="share-capture-content"></div><footer class="share-image-footer">${escape(options.title)}</footer>`;
      const content = root.querySelector('.share-capture-content');
      if (scope.closest('.meal-journal')) content.classList.add('meal-journal');
      content.append(clone);
      doc.body.append(root);
      await timeout(Promise.all(styles), '分享样式加载超时，请重试。');
      await timeout(ready(root), '图片加载超时，请重试。');
      for (const [frame, source] of reportCopies) await renderReport(frame, source);
      await ready(root);
      root.querySelectorAll('.meal-energy-plot svg').forEach(svg => {
        // The live chart uses measured pixels; the export has its own width.
        // Match the SVG's normalized coordinates to the HTML point positions.
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.querySelectorAll('path,line').forEach(node => node.setAttribute('vector-effect', 'non-scaling-stroke'));
      });
      inlineSvgStyles(root);
      const imageWidth = Math.ceil(Math.max(root.scrollWidth, root.getBoundingClientRect().width));
      const imageHeight = Math.ceil(Math.max(root.scrollHeight, root.getBoundingClientRect().height));
      const blob = await window.htmlToImage.toBlob(root, { width: imageWidth, height: imageHeight, pixelRatio: ratio(imageWidth, imageHeight), backgroundColor: '#fff', skipFonts: true });
      if (!blob || !blob.size) throw Error('图片生成失败，请重试。');
      return blob;
    } finally {
      stage.remove();
    }
  }
  async function open(button) {
    const scope = button.closest('[data-share-scope]');
    if (!scope) return;
    setup();
    if (result) URL.revokeObjectURL(result.url);
    result = null;
    trigger = button;
    const token = ++sequence;
    const options = { title: button.dataset.shareTitle || '健康记录', context: button.dataset.shareContext || '' };
    preview.replaceChildren();
    preview.setAttribute('aria-busy', 'true');
    status.textContent = '正在生成…';
    retry.hidden = true;
    download.disabled = true;
    nativeShare.hidden = true;
    if (!dialog.open) dialog.showModal();
    try {
      const blob = await timeout(capture(scope, options), '生成超时，请重试。', 60000);
      if (token !== sequence || !dialog.open) return;
      const name = `healthy-${options.title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').slice(0, 80)}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      result = { url, file, name, title: options.title };
      const image = new Image();
      image.alt = `${options.title}分享长图`;
      image.src = url;
      await loadedImage(image);
      if (token !== sequence || !dialog.open) return;
      preview.replaceChildren(image);
      status.textContent = '';
      download.disabled = false;
      nativeShare.hidden = !(navigator.canShare?.({ files: [file] }) && navigator.share);
    } catch (error) {
      if (token !== sequence || !dialog.open) return;
      status.textContent = error.message || '图片生成失败，请重试。';
      retry.hidden = false;
    } finally {
      if (token === sequence) preview.removeAttribute('aria-busy');
    }
  }
  document.addEventListener('click', event => {
    const target = event.target.closest('[data-share]');
    if (!target || target.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    void open(target);
  }, true);
  window.HealthShare = { button, registerFrame: (frame, source) => frames.set(frame, source) };
})();
