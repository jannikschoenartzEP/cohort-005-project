import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  chooseTransport,
  knockTransport,
  notify,
  type KnockWorkflows,
  type Notification,
  type NotificationTransport,
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

  it("logs a failed send, carries on with the rest and never throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const sent: Notification[] = [];
    const flaky: NotificationTransport = {
      async send(notification) {
        if (notification.recipient.id === pat.id) {
          throw new Error("401 The API key you supplied is invalid");
        }
        sent.push(notification);
      },
    };
    const toAlex = { ...raised, recipient: { ...pat, id: 8, name: "Alex" } };

    await expect(notify([raised, toAlex], flaky)).resolves.toBeUndefined();

    expect(sent).toEqual([toAlex]);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("writes each Notification to a local folder when there is no Knock API key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "notifications-"));

    await notify([raised], chooseTransport({ KNOCK_API_KEY: "" }, directory));

    const files = readdirSync(directory);
    expect(files).toHaveLength(1);
    const written = JSON.parse(readFileSync(join(directory, files[0]), "utf8"));
    expect(written).toEqual(raised);
  });
});
