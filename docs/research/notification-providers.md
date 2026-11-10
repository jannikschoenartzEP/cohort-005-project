# Which notification providers fit Cadence?

Research for [#4](https://github.com/jannikschoenartzEP/cohort-005-project/issues/4) (map [#3](https://github.com/jannikschoenartzEP/cohort-005-project/issues/3)). Checked against vendor docs and pricing pages on **2026-11-10**. Prices and plan contents change often, so re-check them before you commit to a vendor.

## What Cadence needs

- An in-app **Notification** feed (a bell plus a persistent inbox with read/unread) and real-time toasts, for Student, Instructor, Team Admin and Platform Admin.
- A SaaS provider with a usable free/dev tier and an **EU data region**.
- A Node server (React Router 8 SSR) that triggers Notifications. The client uses React 19.
- Email and push are out of scope for now, but the provider must not rule them out.

## Summary

| | Novu Cloud | Courier | Knock | SuprSend | MagicBell |
|---|---|---|---|---|---|
| EU region | **Yes, Frankfurt, on all plans incl. Free** [1] | Yes (`api.eu.courier.com`), **paid plans only** (Business/Enterprise) [8][9] | **No.** "Coming soon", expected end of 2026 [13] | Not documented. "Custom data center region" is Enterprise only [18] | Not documented [23] |
| Free tier | 10k workflow runs/mo, 5 workflows, 30-day inbox retention [2][3] | 10k sends/mo (Developer) [8] | 10k messages/mo [12] | 10k notifications/mo, SuprSend branding on feed [18] | 1k deliveries/mo [22] |
| Next tier | Pro from $30/mo (30k runs, 20 workflows) [2] | Business, pay-as-you-go $0.005/send [8] | Starter $250/mo [12] | Essentials $100/mo [18] | Startup $249/mo [22] |
| Prebuilt React inbox | `<Inbox>` (bell + popover) [4] | `<CourierInbox>`, `<CourierInboxPopupMenu>` [10] | `NotificationIconButton`, `NotificationFeedPopover`, `NotificationFeed` [14] | `Inbox` popover, full-screen feed [19] | `Inbox`, `FloatingInbox` [24] |
| Prebuilt toast | No. Build it on the `notification_received` event [6] | **Yes**, `<CourierToast>` [10][11] | No. Use `items.received.realtime` + react-hot-toast [15] | No. Build it on the `feed.new_notification` listener [20] | Yes, `ToastContainer` / `toasts` prop [24] |
| Headless | `@novu/react` hooks (`useNotifications`, `useCounts`), `@novu/js` [5][6] | `useCourier()` hook [10] | React hooks + `@knocklabs/client` [14] | Headless hooks [20] | Not documented on the React page [24] |
| Theming | `appearance` (variables, elements, dark `baseTheme`), Tailwind classes, render props [7] | `CourierInboxTheme` / `CourierToastTheme`, custom views [10] | `--rnf-` CSS variables, `renderItem`, `colorMode` [16] | `theme` prop, `themeType="dark"`, custom component slots [21] | CSS custom properties, class overrides [24] |
| Read/unread | `read()` / `unread()` / `archive()` [6] | read / opened / archived, synced across devices [10] | read / seen / unread badge modes [16] | `markAsRead` / `markAsUnread` / archive [21] | read/unread states in `Inbox` [24] |
| Client auth | HMAC-SHA256(secretKey, subscriberId) passed as `subscriberHash` [5] | Backend-minted JWT, scopes, `expires_in` [11] | RS256 JWT, `signUserToken` in `@knocklabs/node` [17] | ES256 JWT, signing key, `refreshUserToken` [19] | HS256 user JWT signed with project secret [25] |
| Node trigger | `@novu/api`: `novu.trigger({ workflowId, to, payload })` [3] | `client.send.message({ to, template, routing })` [9] | `workflows.trigger` (key, recipients, data, actor, tenant) [15] | `@suprsend/node-sdk`, `WorkflowTriggerRequest` [19] | `magicbell-js` (Node client) [23] |
| Email/push later | Yes. Email, SMS, chat and push are all on Free [2] | Yes. Inbox is "a channel like `email` or `push`" [9] | Yes | Yes | Yes (email, mobile + web push) [23] |

## Shortlist

1. **Novu Cloud (first choice).** It is the only vendor whose **Free plan includes the EU region** (Frankfurt) [1][2], so Cadence can develop and launch in the EU without paying. It has a prebuilt `<Inbox>` with a `routerPush` hook for React Router navigation [4], a headless hooks path if we outgrow it [5], strong theming (including Tailwind classes) [7], and real-time socket events that are enough to build toasts [6]. Auth is a simple HMAC that our Node server computes per user [5]. Pro costs $30/mo [2], so the path from free to paid is cheap.
   - Caveats: there is no prebuilt toast, so we wire `notifications.notification_received` to our own toast UI. Free allows **5 workflows** [3], which may be too few if each kind of Notification needs its own workflow. The event-catalogue ticket should count the kinds. Free keeps Inbox messages for 30 days, Pro for 90 [3]. An account is bound to its region at creation, so we must sign up on `eu.dashboard.novu.co` from the start [1].
2. **Courier (runner-up).** It has the most complete prebuilt UI: an inbox, a popup menu **and a toast component** sharing one real-time feed [10][11]. It also has an EU datacenter [9] and a mature multi-channel Send API [9]. The catch is that **EU is only available on paid plans** [8][9], which start at pay-as-you-go $0.005/send. That is cheap at small scale (for example 5k sends ≈ $25/mo), but it is not free. The SDK also does not refresh tokens for us: we must re-mint the JWT and call `signIn` again [11]. The components render client-side only [10].

**Ruled out for now:**

- **Knock.** It has excellent React components and an RS256 token model, but **no EU region yet**. Its own docs say "EU data residency is coming soon… by the end of 2026" (added 2026-10-23) [13]. Revisit if it ships.
- **SuprSend.** An EU region is not documented. Custom data-center regions are Enterprise only [18], and the free feed shows SuprSend branding.
- **MagicBell.** No EU hosting is documented. Its free tier is the smallest (1k deliveries) and the next tier costs $249/mo [22].

## How the shortlisted options fit Cadence's stack

- **Node trigger:** both are a single SDK call from a route action or a domain service. Recipients are identified by our user id (`subscriberId` / `user_id`), and both can create the recipient inline on first send [3][9].
- **Client auth:** both make the server sign something per user. Novu needs an HMAC string, which is stateless and does not expire [5]. Courier needs a JWT with `user_id:` scope and `expires_in`, minted by calling Courier's API [11]. Either value can be produced in a React Router loader and passed to the client.
- **SSR:** both inboxes are client components. Courier says so explicitly ("render only on the client") [10]. Plan to render the bell inside a client-only boundary.
- **React version:** `@novu/react` requires React ≥ 18 [4], and `@trycourier/courier-react` supports React 18+ [10]. Cadence uses React 19.2.

## Unverified / open

- **Knock EU timing:** the only source is the roadmap callout in Knock's docs [13]. No launch was found as of 2026-11-10.
- **SuprSend EU:** the trust/subprocessor page returned 403. The only evidence is the pricing page's Enterprise-only "Custom Data Center Region" [18].
- **MagicBell:** no EU region, real-time transport or headless hooks are documented on the pages we read [23][24]. We did not confirm these through sales.
- **Courier free tier:** the pricing page does not explicitly list Inbox under the Developer plan. We assume it is included because Inbox is a standard channel [9]. Courier's plan gating for EU is consistent on its datacenter page ("every paid plan: Business and Enterprise") [9], but an older page said Enterprise only. Trust the datacenter page.
- **Novu render props:** `renderNotification` / `renderBell` / `renderSubject` exist, but their docs disagree about which component owns which prop [7]. Check against the installed version.
- **Novu workflow cap:** it is not yet clear whether 5 workflows on Free is enough. That depends on the event catalogue (#5/#6).
- **Whether the inboxes work in React 19 + SSR:** we did not test this hands-on. It is covered by the "Hands-on provider trial" item on #3.

## Sources

1. Novu, Security and Compliance (data residency, EU endpoints): https://docs.novu.co/platform/additional-resources/security
2. Novu pricing: https://novu.co/pricing
3. Novu limits: https://docs.novu.co/platform/developer/limits ; TypeScript server SDK: https://docs.novu.co/platform/sdks/server/typescript
4. Novu React quickstart: https://docs.novu.co/platform/quickstart/react
5. Novu, Prepare for production (HMAC): https://docs.novu.co/platform/inbox/prepare-for-production ; Headless mode: https://docs.novu.co/platform/inbox/headless-mode
6. Novu `@novu/js` (events, read/unread): https://docs.novu.co/platform/sdks/javascript
7. Novu styling: https://docs.novu.co/platform/inbox/configuration/styling ; item customization: https://docs.novu.co/platform/inbox/advanced-customization/customize-notification-items
8. Courier pricing: https://www.courier.com/pricing
9. Courier datacenters: https://www.courier.com/docs/workspaces/datacenters ; Send to the inbox: https://www.courier.com/docs/in-app/send-to-the-inbox
10. Courier React SDK: https://www.courier.com/docs/sdk-libraries/courier-react-web ; Inbox overview: https://www.courier.com/docs/platform/inbox/inbox-overview
11. Courier authenticate users: https://www.courier.com/docs/in-app/authenticate-users ; toasts: https://www.courier.com/docs/in-app/toasts
12. Knock pricing: https://knock.app/pricing
13. Knock docs, EU roadmap callout (merged 2026-10-23): https://github.com/knocklabs/docs/pull/1796 (content/developer-tools/security.mdx)
14. Knock React overview: https://docs.knock.app/in-app-ui/react/overview
15. Knock toasts: https://docs.knock.app/in-app-ui/react/toasts ; trigger API: https://docs.knock.app/send-notifications/triggering-workflows/api
16. Knock feed component: https://docs.knock.app/in-app-ui/react/feed
17. Knock security & authentication: https://docs.knock.app/in-app-ui/security-and-authentication
18. SuprSend pricing: https://www.suprsend.com/pricing
19. SuprSend client authentication: https://docs.suprsend.com/docs/client-authentication ; Node trigger: https://docs.suprsend.com/docs/node-trigger-workflow-from-api ; React SDK: https://docs.suprsend.com/docs/react-sdk
20. SuprSend headless feed: https://docs.suprsend.com/docs/react-sdk-headless-feed ; toasts: https://docs.suprsend.com/docs/react-toast-notifications
21. SuprSend customising feed: https://docs.suprsend.com/docs/react-customising-feed
22. MagicBell pricing: https://www.magicbell.com/pricing
23. MagicBell docs index: https://www.magicbell.com/docs ; security: https://www.magicbell.com/security
24. MagicBell React components: https://www.magicbell.com/docs/libraries/magicbell-react
25. MagicBell user JWT: https://www.magicbell.com/docs/api/authentication/user
