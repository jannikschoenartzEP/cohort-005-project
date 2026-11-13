# What do Knock's docs say about SSR, real-time on Free, and token refresh?

Research for [#10](https://github.com/jannikschoenartzEP/cohort-005-project/issues/10) (map [#3](https://github.com/jannikschoenartzEP/cohort-005-project/issues/3)). Checked against Knock's docs, pricing page and package source on **2026-11-13**.

Package versions looked at (latest on npm on that date, and the same as `main` on GitHub): `@knocklabs/react` 0.15.1, `@knocklabs/react-core` 0.17.1, `@knocklabs/client` 0.23.1, `@knocklabs/node` 1.41.1 [30][34].

## Answers

**1. SSR.** The components can be imported and rendered on the server without crashing. `@knocklabs/react` starts with `"use client"` [1]. Every `window`/`document` access in the client is guarded, so the websocket is only created when `window` and `WebSocket` exist [5][6]. The feed fetch runs in `useEffect` [8][9]. The docs never mention SSR, Remix or React Router. Their only pattern is the Next.js quick start, which puts the providers in a `"use client"` component [11]. Rendering is not side-effect free, though. `KnockProvider` creates and authenticates the client inside `useMemo` during render [3]. So on the server it can send an inline-identify `PUT /v1/users/:id` [4][10], and if you pass `onUserTokenExpiring` it schedules a `setTimeout` that is never cleared [4]. For Cadence, set `enabled` to `false` until the app has hydrated. With `enabled` false, the client creates no timer, makes no requests and opens no socket [2][3][12].

**2. Real-time on Free.** No primary source says outright that "real-time is included on Free". Real-time works through the same in-app channel and feed components. The pricing page lists in-app feeds, pre-built components and the Feed API as "Yes" on Free [14], and the docs say all feed components support real-time [16]. Real-time is also missing from the Enterprise-only feature list [15]. So it is available, but not stated in those words (**Unconfirmed as an explicit statement**). Free includes up to 10,000 messages sent per month, with no hard cap [14]. A message is one notification delivered to one user on one channel, so every in-app feed recipient counts as one message [14][15]. Neither source gives an MAU or connection cap, or any rate limit for websocket connections (**Unconfirmed**).

**3. Token refresh.** `signUserToken(userId, { signingKey?, expiresInSeconds?, grants?, shouldGenerateJti? })` signs an RS256 JWT with `sub`, `iat`, `exp` and an optional `grants` claim [20][21]. The key comes from `KNOCK_SIGNING_KEY` by default, as PEM or base64-encoded PEM [19][20]. The default expiry is 3600 s, and no maximum is documented [19][20]. `KnockProvider` accepts `onUserTokenExpiring` and `timeBeforeExpirationInMs`, which default to 30 000 ms [2][22][23]. If the callback resolves to a string, the client re-authenticates with it and restarts the socket. If it resolves to anything else, nothing happens [4][23]. The docs recommend making the token expiry equal to your session expiry. If that isn't possible, use a short-lived token and refresh it through `onUserTokenExpiring`, or call `authenticate` again [19].

## 1. SSR safety of `@knocklabs/react`

What the docs say:

- Nothing on SSR, Remix, React Router or `window`. The Next.js quick start says "Since this file uses client-side React APIs, it will need to be a client component" and adds `"use client"` to the component that renders `KnockProvider`, `KnockFeedProvider` and `NotificationIconButton` [11].
- `KnockProvider` takes an `enabled` prop (default `true`). When it is `false`, "children still render but the Knock client stays idle: no identify call, no API requests, and no websocket". The docs recommend this over mounting and unmounting the provider [12][13].

What the source shows:

- `"use client"` is at the top of `packages/react/src/index.ts`, and the published `dist/esm/index.mjs` and `dist/cjs/index.js` keep it [1]. React Router ignores this directive. It only matters for React Server Components.
- `useAuthenticatedKnockClient` runs `new Knock(...)` and `knock.authenticate(...)` inside `React.useMemo`, during render. Teardown runs in a `useEffect` cleanup, and that cleanup never runs on the server [3].
- The `ApiClient` constructor only creates the Phoenix `Socket` and adds the `online` listener inside `if (typeof window !== "undefined" && typeof WebSocket !== "undefined")`. The page-visibility code checks `typeof document` first [5]. I found no unguarded top-level `window`/`document`/`navigator` access in the published `@knocklabs/client`, `@knocklabs/react-core` or the feed/core modules of `@knocklabs/react`. The one `window` use I found, a popup helper in `core/utils`, runs only when the function is called (checked in the dist files) [30].
- Feeds: `useNotifications` creates the `Feed` in a `useState` initializer and calls `listenForUpdates()`. That call joins through the socket manager, which is `undefined` on the server, so nothing connects ("In server environments we might not have a socket connection") [6][7]. `BroadcastChannel` is guarded with `typeof self !== "undefined"` [6].
- `NotificationFeed` calls `feedClient.fetch()` in `useEffect` [8]. `useFeedSettings` fetches the branding settings in `useEffect` [9]. `NotificationFeedPopover` creates Popper in `useEffect` [1].

Server-side side effects (inferred from the source, not tested):

- **Inline identify on the server.** `authenticate()` defaults to `identificationStrategy: "inline"`. Whenever `user` is an object with an `id`, even `{ id }` alone, it calls `user.identify()`, which sends `PUT /v1/users/:id` with the remaining properties [4][10]. Because this runs in `useMemo`, it fires during SSR too (Node has `fetch`).
- **Orphaned refresh timer on the server.** If a token is passed together with `onUserTokenExpiring`, `authenticate()` schedules `setTimeout(exp - timeBeforeExpirationInMs - now)` [4]. The token is decoded with `atob`, which also exists in Node [31]. On the server no effect cleanup runs, so each SSR request leaves a timer that keeps its Knock instance alive for about an hour. When the timer fires, it calls the app's callback inside Node. A `fetch("/api/knock-token")` with a relative URL would reject there. The rejection is not caught inside the timer [4].

Recommended pattern for Cadence (derived from [2][3][12]): keep the providers in `layout.app.tsx`, but pass `enabled={hydrated && Boolean(knockUserId && knockUserToken)}`, where `hydrated` becomes `true` in a `useEffect`. With `enabled` false, the hook passes no user and no token to `authenticate`, so it skips both the identify call and the timer [3][4][33]. Passing `identificationStrategy="skip"` also removes the client-side identify call completely [2][12].

## 2. Real-time on the Free plan

- **Availability.** No primary source says outright that "real-time is on Free" (**Unconfirmed as an explicit statement**). The evidence that it is available:
  - The pricing comparison shows in-app feeds (unlimited per recipient), pre-built components, bring-your-own components and the Feed API as "Yes" for Free, Starter and Enterprise [14].
  - The plans doc says most features are available on all three plans. Its Enterprise-only list does not include real-time or feeds [15].
  - The docs say "All Knock feed components support real-time updates through websocket connections" [16]. They describe the real-time service as a managed websocket service that the SDKs run automatically [17][32].
- **Free plan limits** [14]:
  - $0/month.
  - Up to 10,000 messages sent, 500 guide recipients and 500 agent credits per month.
  - Unlimited stored profiles, workflows, delivery channels and team members.
  - Unlimited isolated environments.
  - 30-day log retention. Feed retention is unlimited.
  - "Manage via API & CLI" is "Yes".
  - "Remove Knock branding" is "No".
  - "We don't hard cap your messages". If you go over without a billing method, Knock contacts you about adding one the next month.
- **What counts as a message.**
  - "A single message delivered to a single user on a single channel." One trigger that sends an in-app message and an email counts as two. Bounced or failed messages, and steps skipped because of preferences, are not charged [14][15].
  - So each recipient of an in-app feed step counts as one message.
  - Toasts that come from real-time events (`items.received.realtime`) on the same feed channel [29] should not add messages. The pricing page lists "a Knock in-app channel used for toast messages" as a separate channel example, so a separate toast channel would add one message per recipient (inference from [14]).
  - Usage accrues in every environment. The in-app channel does not support sandbox mode, so in-app test sends in development also count [15].
- **MAU / connections.** The pricing page and the plans doc state no MAU, notified-recipient or concurrent-connection limit for Free (**Unconfirmed**; not documented).
- **Rate limits.**
  - The REST API is rate limited per endpoint in tiers, from 1 to 1,000 requests per second, and returns `429` [18].
  - With a signed user token, the limit applies per environment and per signing user [18].
  - Nothing documents rate limits for websocket connections (**Unconfirmed**).
  - In the client, socket reconnects use exponential backoff with full jitter, capped at 600 s. Channel rejoins cap at 60 s [5].

## 3. Token signing and refresh

Signing (`@knocklabs/node` 1.41.1) [19][20][21]:

- Import it with `import { signUserToken } from "@knocklabs/node"` (README) [21]. The docs show `@knocklabs/node/lib/tokenSigner` [19]. Both paths resolve, because the package's `./*` export maps to `dist/*` [34].
- Algorithm: RS256, using `jose` `importPKCS8` and `SignJWT`. The header is `{ alg: "RS256", typ: "JWT" }` [20].
- Signing key: the `signingKey` option, otherwise `process.env.KNOCK_SIGNING_KEY`. It must be PEM (`-----BEGIN`) or base64-encoded PEM (`LS0tLS1CRUdJTi...`), otherwise the call throws [20]. The dashboard shows the key only once, under Platform > API keys [19].
- Claims: `sub` (the user id, required), `iat`, `exp`, an optional `grants` claim, and an optional `jti` [20]. The docs require `sub` and recommend `iat`/`exp` [19].
- Options: `signingKey`, `expiresInSeconds` (default `60 * 60`, which is 3600 s), `grants` (build them with `buildUserTokenGrant`), and `shouldGenerateJti` (default `false`). Without a `jti`, two tokens signed in the same second are identical [20][21].
- No maximum expiry is documented, and the source enforces none (**Unconfirmed** whether the API enforces one). The README example uses 43,200 s (12 h) [21].

The client side, `KnockProvider` in `@knocklabs/react-core` 0.17.1:

- The props `onUserTokenExpiring` and `timeBeforeExpirationInMs` exist in the source and are passed through to `knock.authenticate` [2][3]. They appear on the React `KnockOptions` type page (default 30 000 ms) [22], but not on the `KnockProvider` component page [12].
- Callback signature: `(currentToken: string, decodedToken: JwtPayload) => Promise<string | void>` [24]. The docs show only the first argument [23].
- Semantics [4][23]:
  - **When it fires.** At `max(exp*1000 - timeBeforeExpirationInMs - now, 1000)` ms after authentication. A token without `exp`, or one that has already expired, schedules nothing.
  - **Return value is a string.** The client calls `authenticate(userId, newToken, sameOptions)`. Because the credentials changed, it tears down the API client and feed sockets, rebuilds them, and schedules the next refresh.
  - **Return value is anything else (including nothing).** The client does nothing more and does not retry. The old token stays in use until it expires.
  - **The new token does not expire later.** If its `exp` is not later than the old one, or falls inside the lead window, the client logs an error and does not re-authenticate.
  - **Torn down while the callback runs.** If the client was torn down or re-authenticated meanwhile, the result is ignored.
- Docs pattern [19]: make the token expiry equal to your session expiry so both are regenerated together. If that isn't possible, use a short-lived token and refresh it before it expires. `onUserTokenExpiring` is the hook for that, and calling `authenticate` again with a new token "at any time" restarts the real-time connection.

Gotchas for Cadence (inferred from the source):

- **Keep the callback reference stable.** `useStableOptions` compares options deeply, but functions only by `===`. An inline arrow therefore creates new options on every render, so the client `useMemo` runs again [2][3][25]. When it runs again and the token inside the client (refreshed by the callback) differs from the `userToken` prop (still the loader's token), the hook re-authenticates in place with the **prop** [3]. That can revert the client to the old token, which may already have expired.
- **Two ways to keep the token consistent.**
  - (a) Use a stable callback that returns the new token, and make sure nothing re-runs the memo with the old prop.
  - (b) Use a callback that stores the new token in React state, passes that state as `userToken`, and returns nothing. The prop change then triggers one in-place re-authentication with exactly one reconnect [3][4]. (b) keeps the prop as the single source of truth.
- **Loader revalidation reconnects the socket.** Each run of the `layout.app.tsx` loader signs a new token (new `iat`/`exp`). A changed `userToken` prop counts as changed credentials, which means a socket teardown and reconnect [3][4]. Revalidating that loader often means frequent reconnects.

## Contradictions with #9

1. **SSR is not side-effect free.** #9 renders `KnockProvider` in the SSR'd layout with a server-signed token and an expiry callback. In the source, render-time `authenticate()` does an inline identify and schedules a refresh timer that is never cleared on the server [3][4]. Gate the provider with `enabled` until it has hydrated (see section 1).
2. **Keying `KnockProvider` by `knockUserId` is redundant and goes against the documented pattern.** The docs recommend `enabled` "rather than mounting and unmounting `KnockProvider` as that identity changes" [12][13]. The hook already handles a `userId` change by re-authenticating in place, and the feed subtree remounts because its key includes `userId` [3]. Keying still works (the unmount cleanup tears down the old client [3]), but it is not needed.
3. **Inline identification happens twice.** #9 identifies recipients inline at trigger time with `{id,name,email}`. `KnockProvider` defaults to `identificationStrategy: "inline"` and also sends `PUT /v1/users/:id` from the browser, and from the server during SSR [2][4][27]. Properties are deep-merged, so `{}` should not erase name or email [28], but the call is redundant. Pass `identificationStrategy="skip"`.
4. **The 24 h fallback is unnecessary.** The expiry callback exists [2][22][23], so the fallback token from the loader is not needed. Note that the docs' preferred option is token expiry equal to session expiry, with short-lived tokens plus refresh as the alternative [19]. The 1 h expiry in #9 matches the SDK default of 3600 s [20].
5. **Free plan, environments and CLI.**
   - Enhanced security, the CLI, the Management API and environments are not gated on Free [14][15].
   - An account starts with a single production environment. The CLI targets the default environment, which is production until environments are enabled and development afterwards. Enabling environments can't be undone [26].
   - Usage counts in every environment, and in-app can't be sandboxed, so dev sends also count against the 10,000 [15].
6. **Knock branding on Free.** "Remove Knock branding" is "No" on Free [14]. The pre-built `NotificationFeed` shows a "Powered by Knock" link when the feed settings say `branding_required` [8][9].
7. **EU region.** Not available: "We expect to support EU data residency by the end of 2026" [15]. Any EU data-residency assumption in #9 does not hold today. The `host` prop exists, but no EU host is documented (**Unconfirmed**).
8. **Docs gap, not a contradiction.** The `KnockProvider` component page leaves out `onUserTokenExpiring` and `timeBeforeExpirationInMs` [12]. Their existence on `KnockProvider` is confirmed from source [2] and the React `KnockOptions` type page [22].

## Sources

1. `@knocklabs/react` entry with `"use client"`, and NotificationFeedPopover: https://github.com/knocklabs/javascript/blob/main/packages/react/src/index.ts , https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeedPopover/NotificationFeedPopover.tsx
2. KnockProvider source: https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/context/KnockProvider.tsx
3. useAuthenticatedKnockClient source: https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/hooks/useAuthenticatedKnockClient.ts
4. Knock client class (authenticate, maybeScheduleUserTokenExpiration): https://github.com/knocklabs/javascript/blob/main/packages/client/src/knock.ts
5. ApiClient (socket creation guard, backoff): https://github.com/knocklabs/javascript/blob/main/packages/client/src/api.ts
6. Feed client (listenForUpdates, BroadcastChannel guard): https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/feed/feed.ts
7. useNotifications hook: https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/feed/hooks/useNotifications.ts
8. NotificationFeed component: https://github.com/knocklabs/javascript/blob/main/packages/react/src/modules/feed/components/NotificationFeed/NotificationFeed.tsx
9. useFeedSettings hook: https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/feed/hooks/useFeedSettings.ts
10. UserClient.identify: https://github.com/knocklabs/javascript/blob/main/packages/client/src/clients/users/index.ts
11. Next.js quick start: https://docs.knock.app/getting-started/quick-start/nextjs
12. KnockProvider docs: https://docs.knock.app/in-app-ui/react/sdk/components/knock-provider
13. `@knocklabs/react` README: https://github.com/knocklabs/javascript/blob/main/packages/react/README.md
14. Pricing: https://knock.app/pricing
15. Knock plans and usage: https://docs.knock.app/manage-your-account/knock-plans
16. Handling interactivity (real-time note): https://docs.knock.app/in-app-ui/feeds/handling-interactivity
17. Real-time socket behavior: https://docs.knock.app/in-app-ui/feeds/socket-behavior
18. API reference overview, rate limits: https://docs.knock.app/api-reference/overview
19. Security and authentication: https://docs.knock.app/in-app-ui/security-and-authentication
20. `signUserToken` source: https://github.com/knocklabs/knock-node/blob/main/src/lib/tokenSigner.ts
21. knock-node README (token signing): https://github.com/knocklabs/knock-node/blob/main/README.md
22. React SDK `KnockOptions` type: https://docs.knock.app/in-app-ui/react/sdk/types/knock-options
23. JavaScript SDK `AuthenticateOptions` type: https://docs.knock.app/in-app-ui/javascript/sdk/types/authenticate-options
24. Client interfaces (`UserTokenExpiringCallback`): https://github.com/knocklabs/javascript/blob/main/packages/client/src/interfaces.ts
25. useStableOptions and deepEqual: https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/hooks/useStableOptions.ts , https://github.com/knocklabs/javascript/blob/main/packages/react-core/src/modules/core/deepEqual/index.ts
26. Environments: https://docs.knock.app/version-control/environments
27. Identifying recipients (client-side inline identification): https://docs.knock.app/managing-recipients/identifying-recipients
28. Users (properties deep-merged on upsert): https://docs.knock.app/concepts/users
29. React toasts (`items.received.realtime`): https://docs.knock.app/in-app-ui/react/toasts
30. Published packages: https://www.npmjs.com/package/@knocklabs/react , https://www.npmjs.com/package/@knocklabs/react-core , https://www.npmjs.com/package/@knocklabs/client
31. Client JWT decode: https://github.com/knocklabs/javascript/blob/main/packages/client/src/jwt/index.ts
32. React feed docs (socket options): https://docs.knock.app/in-app-ui/react/feed
33. `@knocklabs/client` README (idle without a user): https://github.com/knocklabs/javascript/blob/main/packages/client/README.md
34. `@knocklabs/node` package (version, exports): https://www.npmjs.com/package/@knocklabs/node , https://github.com/knocklabs/knock-node/blob/main/package.json
