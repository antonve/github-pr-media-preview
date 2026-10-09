// ==UserScript==
// @name         GitHub PR Media Preview
// @namespace    github-pr-media-preview
// @version      1.1.0
// @description  Preview issue and pull-request images and recordings in a modal without leaving GitHub.
// @homepageURL  https://github.com/antonve/github-pr-media-preview
// @updateURL    https://raw.githubusercontent.com/antonve/github-pr-media-preview/main/github-pr-media-preview.user.js
// @downloadURL  https://raw.githubusercontent.com/antonve/github-pr-media-preview/main/github-pr-media-preview.user.js
// @match        https://github.com/*
// @run-at       document-start
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  // Run on all GitHub pages so navigation into an issue or PR without a reload still works.
  const installed = '__githubPrMediaPreviewInstalled';
  if (window[installed]) return;
  window[installed] = true;

  const scope = '.markdown-body, .js-comment-body, .comment-body, .image-diff, .js-image-diff';
  const gallerySelector = scope.split(',').flatMap(selector => ['img', 'video', 'a[href]'].map(tag => `${selector.trim()} ${tag}`)).join(',');
  const imageExtension = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
  const videoExtension = /\.(?:m4v|mov|mp4|ogv|webm)$/i;
  let ui;
  let activeMedia;
  let previousFocus;
  let savedOverflow;
  let generation = 0;
  let gallery = [];
  let galleryIndex = 0;

  function url(value) {
    if (!value) return null;
    try {
      const parsed = new URL(value, location.href);
      return /^(https?:|blob:)$/.test(parsed.protocol) || /^data:(image|video)\//i.test(value)
        ? parsed : null;
    } catch {
      return null;
    }
  }

  function kindFor(parsed) {
    if (imageExtension.test(parsed.pathname) || /^data:image\//i.test(parsed.href)) return 'image';
    if (videoExtension.test(parsed.pathname) || /^data:video\//i.test(parsed.href)) return 'video';
    return null;
  }

  function isAttachment(parsed) {
    return parsed.hostname === 'github.com' && (
      /^\/user-attachments\/assets\/[\w-]+\/?$/.test(parsed.pathname) ||
      /^\/[^/]+\/[^/]+\/assets\/\d+\/[\w-]+\/?$/.test(parsed.pathname)
    );
  }

  function mediaFor(target) {
    if (!target.closest(scope) || target.closest('[contenteditable="true"]')) return null;
    const anchor = target.closest('a[href]');
    if (anchor?.hasAttribute('download')) return null;
    const media = target.closest('img, video') || anchor?.querySelector('img, video');
    if (media?.matches('.emoji, .avatar, [data-emoji]')) return null;
    if (media) {
      const source = url(media.currentSrc || media.getAttribute('src') || media.querySelector('source')?.src || '');
      if (!source) return null;
      const kind = media.tagName === 'VIDEO' ? 'video' : 'image';
      const linked = anchor && url(anchor.href);
      return {
        src: linked && (kindFor(linked) === kind || isAttachment(linked)) ? linked.href : source.href,
        original: linked?.href || source.href,
        kind,
        title: media.getAttribute('alt') || media.getAttribute('aria-label') || anchor?.textContent.trim() || 'Media preview',
        video: kind === 'video' ? media : null,
        trigger: anchor || media,
      };
    }
    const linked = anchor && url(anchor.href);
    if (!linked) return null;
    const kind = kindFor(linked);
    if (!kind && !isAttachment(linked)) return null;
    const title = anchor.textContent.trim() || 'Attachment preview';
    return {
      src: linked.href,
      original: linked.href,
      kind: kind || (/recording|video|screencast|watch|\.webm|\.mp4|\.mov/i.test(title) ? 'video' : 'image'),
      uncertain: !kind,
      title,
      trigger: anchor,
    };
  }

  function mediaKey(item) {
    const parsed = new URL(item.src);
    // A rendered screenshot has a signed URL, while its text link uses /assets/UUID.
    if (parsed.hostname === 'github.com' || parsed.hostname.endsWith('.githubusercontent.com')) {
      const id = parsed.pathname.match(/[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}/i);
      if (id) return id[0].toLowerCase();
    }
    parsed.hash = '';
    return parsed.href;
  }

  function collectGallery(item) {
    const entries = new Map();
    for (const element of document.querySelectorAll(gallerySelector)) {
      const candidate = mediaFor(element);
      if (candidate && !entries.has(mediaKey(candidate))) entries.set(mediaKey(candidate), candidate);
    }
    const key = mediaKey(item);
    entries.set(key, item);
    gallery = [...entries.values()];
    galleryIndex = gallery.findIndex(candidate => mediaKey(candidate) === key);
  }

  function navigate(direction) {
    const next = galleryIndex + direction;
    if (next < 0 || next >= gallery.length) return;
    galleryIndex = next;
    open(gallery[next], false);
  }

  function createUI() {
    const host = document.createElement('div');
    host.id = 'github-pr-media-preview';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { color-scheme: light dark; }
        * { box-sizing: border-box; }
        dialog {
          position: fixed; inset: 0; margin: auto; padding: 0;
          width: min(1280px, calc(100vw - 40px)); max-width: none;
          height: min(900px, calc(100dvh - 40px)); max-height: none;
          border: 1px solid var(--borderColor-default, #444c56); border-radius: 12px;
          background: var(--bgColor-default, #0d1117); color: var(--fgColor-default, #e6edf3);
          box-shadow: 0 24px 80px #0006;
          font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        dialog[open] { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
        dialog::backdrop { background: #000b; }
        header, footer { display: flex; align-items: center; gap: 12px; padding: 10px 16px; }
        header { border-bottom: 1px solid var(--borderColor-default, #444c56); }
        h2 { flex: 1; min-width: 0; margin: 0; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        button, a { font: inherit; }
        button { min-height: 36px; padding: 6px 12px; border: 1px solid var(--borderColor-default, #444c56); border-radius: 6px; color: inherit; background: var(--bgColor-muted, #161b22); cursor: pointer; }
        button:hover { background: var(--bgColor-neutral-muted, #30363d); }
        button:disabled { opacity: .4; cursor: default; }
        button:focus-visible, a:focus-visible { outline: 2px solid #58a6ff; outline-offset: 3px; }
        #close { width: 36px; padding: 0; font-size: 24px; line-height: 1; }
        #stage { position: relative; min-height: 0; background: var(--bgColor-muted, #161b22); }
        #viewport { position: absolute; inset: 16px; display: flex; align-items: center; justify-content: center; overflow: auto; overscroll-behavior: contain; }
        img, video { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
        video { width: 100%; height: 100%; }
        #stage.actual #viewport { display: block; }
        #stage.actual img { max-width: none; max-height: none; margin: auto; }
        footer { border-top: 1px solid var(--borderColor-default, #444c56); flex-wrap: wrap; }
        nav { display: flex; align-items: center; gap: 8px; }
        nav button { width: 36px; padding: 0; font-size: 18px; }
        #position { min-width: 36px; text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums; }
        #status { flex: 1; margin: 0; color: var(--fgColor-muted, #9198a1); }
        a { color: var(--fgColor-accent, #58a6ff); text-decoration: none; }
        a:hover { text-decoration: underline; }
        [hidden] { display: none !important; }
        @media (max-width: 600px) {
          dialog { width: calc(100vw - 16px); height: calc(100dvh - 16px); border-radius: 8px; }
          header, footer { padding: 8px 12px; gap: 8px; }
          #viewport { inset: 8px; }
          #status { flex-basis: 100%; order: 2; }
          #original { margin-left: auto; }
        }
      </style>
      <dialog aria-labelledby="title" aria-describedby="status">
        <header>
          <h2 id="title">Media preview</h2>
          <button id="zoom" type="button" aria-pressed="false" hidden>Actual size</button>
          <button id="close" type="button" aria-label="Close preview" autofocus>×</button>
        </header>
        <div id="stage"><div id="viewport"></div></div>
        <footer>
          <nav aria-label="Media navigation">
            <button id="previous" type="button" aria-label="Previous preview" title="Previous preview (Left arrow)">←</button>
            <span id="position" aria-live="polite"></span>
            <button id="next" type="button" aria-label="Next preview" title="Next preview (Right arrow)">→</button>
          </nav>
          <p id="status" role="status" aria-live="polite">Loading preview…</p>
          <a id="original" target="_blank" rel="noopener noreferrer">Open original ↗</a>
        </footer>
      </dialog>`;
    const get = (id) => root.getElementById(id);
    const dialog = root.querySelector('dialog');
    const controls = { host, dialog, stage: get('stage'), viewport: get('viewport'), title: get('title'), status: get('status'), zoom: get('zoom'), original: get('original'), close: get('close'), previous: get('previous'), next: get('next'), position: get('position') };
    controls.close.addEventListener('click', close);
    controls.previous.addEventListener('click', () => navigate(-1));
    controls.next.addEventListener('click', () => navigate(1));
    controls.zoom.addEventListener('click', () => {
      const actual = controls.stage.classList.toggle('actual');
      controls.zoom.textContent = actual ? 'Fit to screen' : 'Actual size';
      controls.zoom.setAttribute('aria-pressed', String(actual));
    });
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    });
    root.addEventListener('keydown', (event) => event.stopPropagation());
    return controls;
  }

  function clearMedia() {
    if (activeMedia?.tagName === 'VIDEO') {
      activeMedia.pause();
      activeMedia.removeAttribute('src');
      activeMedia.load();
    } else {
      activeMedia?.removeAttribute('src');
    }
    activeMedia = null;
    ui?.viewport.replaceChildren();
  }

  function close() {
    if (!ui?.dialog.open) return;
    generation += 1; // Ignore any pending load/error events after dismissal.
    clearMedia();
    ui.dialog.close();
    const style = document.documentElement.style;
    if (savedOverflow.value) style.setProperty('overflow', savedOverflow.value, savedOverflow.priority);
    else style.removeProperty('overflow');
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  function loadMedia(item, kind, mayRetry, token) {
    clearMedia();
    const media = document.createElement(kind === 'image' ? 'img' : 'video');
    activeMedia = media;
    const current = () => generation === token && activeMedia === media && ui.dialog.open;
    const ready = () => {
      if (!current()) return;
      media.hidden = false;
      ui.status.textContent = kind === 'image' ? 'Esc to close · Actual size to zoom' : 'Esc to close · Use the player controls';
      ui.zoom.hidden = kind !== 'image';
      if (kind === 'video' && item.video?.currentTime) {
        try { media.currentTime = item.video.currentTime; } catch { /* Some streams cannot seek. */ }
      }
    };
    media.hidden = true;
    if (kind === 'image') {
      media.alt = item.title;
      media.addEventListener('load', ready, { once: true });
    } else {
      media.controls = true;
      media.playsInline = true;
      media.preload = 'metadata';
      media.autoplay = true;
      media.muted = true; // Preview immediately without unexpected audio.
      media.setAttribute('aria-label', item.title);
      media.addEventListener('loadedmetadata', ready, { once: true });
    }
    media.addEventListener('error', () => {
      if (!current()) return;
      if (mayRetry) {
        loadMedia(item, kind === 'image' ? 'video' : 'image', false, token);
      } else {
        clearMedia();
        ui.status.textContent = 'Unable to preview this attachment. Try Open original.';
        ui.zoom.hidden = true;
      }
    }, { once: true });
    ui.viewport.append(media);
    media.src = item.src;
  }

  function open(item, resetGallery = true) {
    if (resetGallery) collectGallery(item);
    ui ||= createUI();
    if (!ui.host.isConnected) document.body.append(ui.host);
    if (!ui.dialog.open) {
      previousFocus = item.trigger?.matches('a, button, [tabindex]') ? item.trigger : document.activeElement;
      const style = document.documentElement.style;
      savedOverflow = { value: style.getPropertyValue('overflow'), priority: style.getPropertyPriority('overflow') };
      style.setProperty('overflow', 'hidden', 'important');
      ui.dialog.showModal();
    }
    item.video?.pause();
    ui.title.textContent = item.title;
    ui.previous.disabled = galleryIndex === 0;
    ui.next.disabled = galleryIndex === gallery.length - 1;
    ui.position.textContent = `${galleryIndex + 1} / ${gallery.length}`;
    ui.original.href = item.original;
    ui.status.textContent = 'Loading preview…';
    ui.stage.classList.remove('actual');
    ui.zoom.hidden = true;
    ui.zoom.textContent = 'Actual size';
    ui.zoom.setAttribute('aria-pressed', 'false');
    if (resetGallery) ui.close.focus({ preventScroll: true });
    loadMedia(item, item.kind, item.uncertain, ++generation);
  }

  document.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!/^\/[^/]+\/[^/]+\/(?:pull|issues)\/\d+(?:\/|$)/.test(location.pathname)) return;
    if (ui && event.composedPath().includes(ui.host)) return;
    if (!(event.target instanceof Element)) return;
    const item = mediaFor(event.target);
    if (!item) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(item);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (ui?.dialog.open && event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    } else if (ui?.dialog.open && ['ArrowLeft', 'ArrowRight'].includes(event.key) &&
      !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey &&
      ui.host.shadowRoot.activeElement?.tagName !== 'VIDEO') {
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }, true);
  for (const name of ['turbo:before-cache', 'turbo:before-render', 'pjax:beforeReplace']) {
    document.addEventListener(name, close);
  }
  window.addEventListener('popstate', close);
})();
