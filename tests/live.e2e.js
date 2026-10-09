// Evaluate this entire file on https://github.com/tadoku/tadoku/pull/1418
// after evaluating github-pr-media-preview.user.js. No network/media mocks.
(async () => {
  const results = [];
  const initialURL = location.href;
  const initialOverflow = document.documentElement.style.getPropertyValue('overflow');
  const root = () => document.getElementById('github-pr-media-preview')?.shadowRoot;
  const dialog = () => root()?.querySelector('dialog');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const wait = async (check, message) => {
    const end = performance.now() + 20000;
    while (!check()) {
      if (performance.now() > end) throw new Error(message);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const run = async (name, fn) => {
    try { await fn(); results.push({ name, result: 'PASS' }); }
    catch (error) { results.push({ name, result: 'FAIL', error: String(error) }); }
    root()?.getElementById('close').click();
  };
  const link = (text) => [...document.querySelectorAll('.markdown-body a')].find(a => a.textContent.trim() === text);
  const preview = async (trigger, kind) => {
    assert(trigger, 'Required PR media is missing');
    trigger.click();
    assert(dialog()?.open, 'Click did not open a modal');
    await wait(() => {
      const media = root().querySelector(kind === 'image' ? 'img' : 'video');
      return media && !media.hidden && (kind === 'image' ? media.naturalWidth > 0 : media.videoWidth > 0);
    }, 'Media did not successfully load');
    assert(location.href === initialURL, 'Preview navigated away from the PR');
    const media = root().querySelector(kind === 'image' ? 'img' : 'video');
    const bounds = root().getElementById('stage').getBoundingClientRect();
    const rect = media.getBoundingClientRect();
    assert(rect.top >= bounds.top && rect.bottom <= bounds.bottom + 1 && rect.left >= bounds.left && rect.right <= bounds.right + 1,
      'Media overflows the preview area; content or player controls are clipped');
    return media;
  };
  assert(/\/tadoku\/tadoku\/pull\/1418$/.test(location.pathname), 'Run on the example PR');
  const details = [...document.querySelectorAll('.markdown-body details')];
  const originalDetails = details.map(el => el.open);
  details.forEach(el => { el.open = true; });

  await run('Inline screenshot loads, zooms, closes, and restores scroll/focus', async () => {
    const image = document.querySelector('.markdown-body img');
    await preview(image, 'image');
    root().getElementById('zoom').click();
    assert(root().getElementById('stage').classList.contains('actual'), 'Actual-size zoom failed');
    root().getElementById('zoom').click();
    assert(!root().getElementById('stage').classList.contains('actual'), 'Fit-to-screen failed');
    root().getElementById('close').click();
    assert(!dialog().open, 'Close failed');
    assert(document.activeElement === image.closest('a'), 'Focus not restored');
    assert(document.documentElement.style.getPropertyValue('overflow') === initialOverflow, 'Scroll lock not restored');
  });
  await run('Extensionless recording loads and really plays; closing stops playback', async () => {
    const video = await preview(link('Recording'), 'video');
    assert(video.controls && video.muted, 'Expected muted player with controls');
    await video.play();
    await wait(() => video.currentTime > 0.1, 'Video did not advance');
    root().getElementById('close').click();
    assert(video.paused && !video.hasAttribute('src'), 'Dismissed video kept playing/loading');
  });
  await run('Previous/next traverse unique images and recordings and stop at both ends', async () => {
    const recording = await preview(link('Recording'), 'video');
    const prev = root().getElementById('previous');
    const next = root().getElementById('next');
    const position = root().getElementById('position');
    assert(prev && next && position, 'Gallery controls are missing');
    assert(position.textContent === '1 / 7' && prev.disabled, 'Expected seven unique media assets, starting at the recording');
    next.click();
    await wait(() => root().querySelector('img')?.naturalWidth > 0, 'Next image did not load');
    assert(position.textContent === '2 / 7', 'Next did not advance');
    assert(recording.paused && !recording.hasAttribute('src'), 'Switching previews did not stop recording');
    prev.click();
    await wait(() => root().querySelector('video')?.videoWidth > 0, 'Previous recording did not load');
    assert(position.textContent === '1 / 7', 'Previous did not go back');
    for (let index=0; index<6; index++) next.click();
    await wait(() => root().querySelector('img')?.naturalWidth > 0, 'Last image did not load');
    assert(position.textContent === '7 / 7' && next.disabled && !prev.disabled, 'Last-item boundary failed');
  });
  await run('Left/right arrow keys navigate previews from dialog controls', async () => {
    await preview(link('Filtered list'), 'image');
    const position = root().getElementById('position');
    assert(position, 'Gallery position is missing');
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight',bubbles:true,cancelable:true}));
    assert(position.textContent === '3 / 7', 'Right arrow did not advance');
    document.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft',bubbles:true,cancelable:true}));
    assert(position.textContent === '2 / 7', 'Left arrow did not go back');
  });
  for (const text of ['Filtered list', 'Keyboard focus', 'Invalid date', 'Empty day', 'Other viewer']) {
    await run(`Extensionless image attachment: ${text}`, () => preview(link(text), 'image'));
  }
  await run('Newly inserted, generically labelled recording falls back from image to video', async () => {
    const asset = document.createElement('a');
    asset.href = link('Recording').href;
    asset.textContent = 'New attachment';
    document.querySelector('.markdown-body').append(asset);
    try { await preview(asset, 'video'); } finally { asset.remove(); }
  });
  await run('Modified clicks and ordinary links keep native navigation', async () => {
    for (const [target, options] of [[link('Recording'), {ctrlKey:true}], [link('Recording'), {metaKey:true}], [document.querySelector('.markdown-body a[href*="/issues/"]'), {}]]) {
      assert(target, 'Test link missing');
      let intercepted;
      const suppressNavigation = (event) => { intercepted = event.defaultPrevented; event.preventDefault(); };
      target.addEventListener('click', suppressNavigation, {once:true});
      target.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, ...options}));
      assert(intercepted === false && !dialog().open, 'Native click was intercepted');
    }
  });
  await run('Media clicks outside issue and PR routes are not intercepted', async () => {
    history.replaceState(null, '', '/tadoku/tadoku');
    const target = link('Recording');
    let intercepted;
    target.addEventListener('click', event => { intercepted = event.defaultPrevented; event.preventDefault(); }, {once:true});
    target.click();
    history.replaceState(null, '', initialURL);
    assert(intercepted === false && !dialog().open, 'Unrelated repository route intercepted');
  });
  await run('Outside click dismisses the dialog', async () => {
    await preview(link('Filtered list'), 'image');
    dialog().dispatchEvent(new MouseEvent('click', {bubbles:true, clientX:0, clientY:0}));
    assert(!dialog().open, 'Backdrop click did not dismiss');
  });
  await run('Missing media shows recovery link instead of navigating', async () => {
    const broken = document.createElement('a');
    broken.href = 'https://github.com/user-attachments/assets/00000000-0000-0000-0000-000000000000';
    broken.textContent = 'Unavailable attachment';
    document.querySelector('.markdown-body').append(broken);
    try {
      broken.click();
      await wait(() => root().getElementById('status').textContent.includes('Unable to preview'), 'No recovery message');
      assert(dialog().open && root().getElementById('original').href === broken.href, 'Recovery link missing');
    } finally { broken.remove(); }
  });
  details.forEach((el, index) => { el.open = originalDetails[index]; });
  history.replaceState(null, '', initialURL);
  return { url: initialURL, results, passed: results.filter(r => r.result === 'PASS').length, total: results.length, boundaries: 'Live GitHub DOM and real asset loading/playback. Userscript-manager injection/installation, private PR authentication, and other browser engines are not covered.' };
})()
