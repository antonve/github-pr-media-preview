# GitHub PR Media Preview

Click an image or recording in a GitHub pull request to preview it without leaving the page. Works with screenshots, plain attachment links (including GitHub URLs without extensions), and embedded videos in PR descriptions and comments. Image diffs using GitHub's `.image-diff` containers are also supported.

## Install

With Tampermonkey installed, [install the userscript](https://raw.githubusercontent.com/antonve/github-pr-media-preview/main/github-pr-media-preview.user.js), accept the installation prompt, and reload GitHub. If the link opens as plain text, use the manual steps below.

1. Install [Tampermonkey](https://www.tampermonkey.net/) in your browser, if needed.
2. Choose **Create a new script** from the extension menu.
3. Replace the editor contents with `github-pr-media-preview.user.js` and save.
4. Reload the GitHub PR.

Press **Escape**, click outside the modal, or use **×** to close. **Actual size** lets you inspect an image at its original resolution. Recordings start muted and have normal playback controls; closing the preview stops playback. Cmd/Ctrl-click, Shift-click, and middle-click retain their usual browser behavior. **Open original** is always available.

Use **← / →** or the Left/Right arrow keys to move between the PR's images and recordings. The counter shows your position. Duplicate screenshot/attachment links appear once, and navigation stops at the first and last item. When the video player has keyboard focus, Left/Right retain their normal seek behavior; Escape always closes the modal.

The script needs no special userscript permissions, external libraries, or network service. It loads only the clicked media. It runs on GitHub pages so GitHub's navigation without a full reload works, but only intercepts media on `/owner/repo/pull/number` routes. Browser codec support determines which recordings can play.

GitHub Enterprise: replace or add the `@match` host and the `github.com` host check in `isAttachment` for your instance.

## Repeatable browser verification

Open https://github.com/tadoku/tadoku/pull/1418 in the T3 collaborative browser. Evaluate the userscript source using `preview_evaluate`, then evaluate `tests/live.e2e.js` with `awaitPromise: true`. The suite exercises real GitHub markup and real media loads and playback. It changes only the local page DOM/history while checking behavior, then restores those fixtures. Reopen the PR if a test is interrupted.

The test output belongs in `tests/evidence/`, with the userscript's SHA-256 hash. Also verify Escape and Tab with the browser's keyboard interaction tools and inspect a saved screenshot at desktop and narrow viewport sizes. Injection through a userscript extension and private PRs require separate verification.

The included verification results record the 14 checks run against the example PR at desktop and narrow viewport sizes. Screenshot captures were inspected and retained locally; generated PNG captures are excluded from the repository.
