// Evaluate on https://github.com/tadoku/tadoku/issues/798 after the userscript.
// Uses the issue's real screenshot plus temporary comment/link fixtures pointing
// at real GitHub media. No requests, decoders, or playback are mocked.
(async () => {
  const results = [];
  const initialURL = location.href;
  const overflow = document.documentElement.style.getPropertyValue('overflow');
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
  const click = target => {
    // Suppress native navigation if the script does not handle this test click.
    const preventNavigation = event => event.preventDefault();
    target.addEventListener('click', preventNavigation);
    try { target.click(); } finally { target.removeEventListener('click', preventNavigation); }
  };
  const preview = async (target, tag) => {
    click(target);
    assert(dialog()?.open, 'Issue media click did not open a modal');
    await wait(() => {
      const media = root().querySelector(tag);
      return media && !media.hidden && (tag === 'img' ? media.naturalWidth > 0 : media.videoWidth > 0);
    }, 'Issue media did not load');
    assert(location.href === initialURL, 'Preview navigated away from the issue');
    const media = root().querySelector(tag);
    const bounds = root().getElementById('stage').getBoundingClientRect();
    const rect = media.getBoundingClientRect();
    assert(rect.top >= bounds.top && rect.bottom <= bounds.bottom + 1 && rect.left >= bounds.left && rect.right <= bounds.right + 1,
      'Media overflows the issue preview area');
    return media;
  };
  const run = async (name, fn) => {
    try { await fn(); results.push({name, result:'PASS'}); }
    catch (error) { results.push({name, result:'FAIL', error:String(error)}); }
    root()?.getElementById('close').click();
  };
  assert(location.pathname === '/tadoku/tadoku/issues/798', 'Run on the issue fixture');
  const image = document.querySelector('.markdown-body img');
  assert(image, 'The live issue screenshot is missing');
  const comment = document.createElement('section');
  comment.className = 'markdown-body';
  comment.setAttribute('aria-label', 'Temporary browser verification comment');
  const attachment = document.createElement('a');
  attachment.href = 'https://github.com/user-attachments/assets/fc7fe549-68c0-4be1-b938-0e147a1fdebf';
  attachment.textContent = 'Issue image attachment';
  const recording = document.createElement('a');
  recording.href = 'https://github.com/user-attachments/assets/370cc838-ed9d-4e79-a485-01bdf2726847';
  recording.textContent = 'Issue recording';
  comment.append(attachment, document.createElement('br'), recording);
  document.querySelector('main').append(comment);
  try {
    await run('Live issue screenshot previews, zooms, and restores focus and scrolling', async () => {
      await preview(image.closest('a'), 'img');
      root().getElementById('zoom').click();
      assert(root().getElementById('stage').classList.contains('actual'), 'Issue image zoom failed');
      root().getElementById('close').click();
      assert(document.activeElement === image.closest('a'), 'Issue opener focus was not restored');
      assert(document.documentElement.style.getPropertyValue('overflow') === overflow, 'Issue scroll lock was not restored');
    });
    await run('New issue comment attachment previews without reinitializing the script', () => preview(attachment, 'img'));
    await run('Extensionless recording in an issue comment plays and stops on close', async () => {
      const video = await preview(recording, 'video');
      assert(video.controls && video.muted, 'Issue recording lacks muted playback controls');
      await video.play();
      await wait(() => video.currentTime > 0.1, 'Issue recording did not play');
      root().getElementById('close').click();
      assert(video.paused && !video.hasAttribute('src'), 'Issue recording kept playing after closing');
    });
    await run('Issue gallery deduplicates the screenshot and its attachment link', async () => {
      const video = await preview(recording, 'video');
      assert(root().getElementById('position').textContent === '2 / 2', 'Expected two unique issue media items');
      root().getElementById('previous').click();
      await wait(() => root().querySelector('img')?.naturalWidth > 0, 'Previous issue image did not load');
      assert(video.paused && !video.hasAttribute('src'), 'Navigation left issue recording playing');
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true, cancelable:true}));
      await wait(() => root().querySelector('video')?.videoWidth > 0, 'Right arrow did not return to issue recording');
      assert(root().getElementById('next').disabled, 'Issue gallery did not stop at its last item');
    });
    await run('Escape dismisses an issue preview', async () => {
      await preview(attachment, 'img');
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape', bubbles:true, cancelable:true}));
      assert(!dialog().open, 'Escape did not dismiss the issue preview');
    });
    await run('Modified issue attachment clicks retain native behavior', async () => {
      for (const options of [{ctrlKey:true}, {metaKey:true}, {shiftKey:true}]) {
        let intercepted;
        const observe = event => { intercepted = event.defaultPrevented; event.preventDefault(); };
        attachment.addEventListener('click', observe);
        try { attachment.dispatchEvent(new MouseEvent('click', {bubbles:true,cancelable:true,...options})); }
        finally { attachment.removeEventListener('click', observe); }
        assert(intercepted === false && !dialog()?.open, 'Modified issue click was intercepted');
      }
    });
    await run('Issue lists, creation forms, and unrelated repository routes remain untouched', async () => {
      for (const path of ['/tadoku/tadoku/issues', '/tadoku/tadoku/issues/new', '/tadoku/tadoku/pulls', '/tadoku/tadoku/blob/main/example.png']) {
        history.replaceState(null, '', path);
        let intercepted;
        const observe = event => { intercepted = event.defaultPrevented; event.preventDefault(); };
        attachment.addEventListener('click', observe);
        try { attachment.click(); } finally { attachment.removeEventListener('click', observe); }
        assert(intercepted === false && !dialog()?.open, 'Unrelated route intercepted: '+path);
      }
      history.replaceState(null, '', initialURL);
    });
    await run('Issue anchors and query strings preserve image previews', async () => {
      history.replaceState(null, '', initialURL+'?test=preview#issue-comment');
      click(attachment);
      assert(dialog()?.open, 'Issue URL with a query and anchor did not preview');
      root().getElementById('close').click();
    });
  } finally {
    root()?.getElementById('close').click();
    history.replaceState(null, '', initialURL);
    comment.remove();
  }
  return {url:initialURL, results, passed:results.filter(result=>result.result==='PASS').length, total:results.length,
    boundaries:'Live GitHub issue markup and screenshot; temporary local comment/attachment fixtures use real GitHub assets, including the recording from PR #1418. No server-side comments are created. Extension installation, private issues, and non-Chromium browsers are not covered.'};
})()
