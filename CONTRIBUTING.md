# Contributing

## Release-ready PRs

To keep the publish cycle short, please include the release prep in your PR so the only step after merge is `git pull && homey app publish`. A merge that needs follow-up commits for version/changelog work delays the store update for users.

For any user-visible change (fix, feature, security patch — not pure refactor), include in the same PR:

1. **Version bump** in `.homeycompose/app.json`
   - Pick the next free `4.1.x`. Skip a number rather than re-using one already in `.homeychangelog.json`.
2. **Changelog entry** in `.homeychangelog.json`
   - One short English sentence, matching the existing style (`"Fix: ...."`, `"Security: ..."`).
   - Credit external contributors in the entry.
3. **Regenerate** `app.json` with `homey app build` and commit the result.
4. **Validate**: `homey app validate --level publish` must pass before opening the PR.

If your change is internal-only (refactor, dep bump that doesn't change behavior, build/test tooling), skip steps 1–2.

## Error handling and the Homey SDK

The Homey SDK treats unhandled promise rejections as fatal — the app crashes and the maintainer gets an email. Any async work that runs from a `setInterval`/`setTimeout` callback, or any other detached context, must catch its own errors.

Concrete spot in this repo to be aware of: [`start_update_loop`](drivers/chargepoint/device.js) and [`pause_update_loop`](drivers/chargepoint/device.js) currently call `this.updateDevice()` from interval/timeout callbacks without awaiting or catching. Today `updateDevice()` swallows API errors internally, but if a code path is ever added that lets a rejection escape, the app will crash on the next loop tick. The safe pattern is:

```js
setInterval(() => {
    this.updateDevice().catch(err => this.error('update loop:', err));
}, 120000);
```

Same shape inside `pause_update_loop`'s `setTimeout`. Capability listeners (`onCapability*`) and flow-card `runListener` callbacks are wrapped by Homey and don't need this — the requirement only applies to detached async work.

## Publish

The Homey App Store account is held by @kaohlive; the actual `homey app publish` upload runs from his machine. After a release-ready PR is merged, ping him so he can pull and publish.
