import { describe, expect, it } from "vitest";
import {
  knockTransport,
  notify,
  type KnockWorkflows,
  type Notification,
} from "./notifications.server";

const pat = { id: 7, name: "Pat Admin", email: "pat@example.com" };
const liam = { id: 3, name: "Liam Thompson", email: "liam@example.com" };

const raised: Notification = {
  kind: "refund-request-raised",
  recipient: pat,
  actor: liam,
  title: "New Refund Request for Test Course",
  body: "Liam Thompson asked for €79.00 back on their Individual Purchase.",
  link: "/admin/refunds",
};

function fakeKnock() {
  const triggers: { key: string; body: unknown }[] = [];
  const knock: KnockWorkflows = {
    workflows: {
      async trigger(key, body) {
        triggers.push({ key, body });
      },
    },
  };
  return { knock, triggers };
}

describe("notify", () => {
  it("triggers the Knock workflow named by the kind, with recipient and actor inline", async () => {
    const { knock, triggers } = fakeKnock();

    await notify([raised], knockTransport(knock));

    expect(triggers).toEqual([
      {
        key: "refund-request-raised",
        body: {
          recipients: [
            { id: "7", name: "Pat Admin", email: "pat@example.com" },
          ],
          actor: { id: "3", name: "Liam Thompson", email: "liam@example.com" },
          data: {
            title: "New Refund Request for Test Course",
            body: "Liam Thompson asked for €79.00 back on their Individual Purchase.",
            link: "/admin/refunds",
          },
        },
      },
    ]);
  });
});
