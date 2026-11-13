import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createVerify, generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  chooseTransport,
  knockFeedCredentials,
  knockTransport,
  notify,
  type KnockWorkflows,
  type Notification,
  type NotificationTransport,
} from "./notifications.server";

// Lets a test make the Knock client fail to build, as it would with a bad
// configuration.
const knockClient = vi.hoisted(() => ({ failToBuild: false }));
vi.mock("@knocklabs/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@knocklabs/node")>();
  class Knock extends actual.default {
    constructor(...args: ConstructorParameters<typeof actual.default>) {
      if (knockClient.failToBuild) throw new Error("Invalid Knock options");
      super(...args);
    }
  }
  return { ...actual, default: Knock };
});

const pat = { id: 7, name: "Pat Admin", email: "pat@example.com" };
const liam = { id: 3, name: "Liam Thompson", email: "liam@example.com" };

const raised: Notification = {
  kind: "refund-request-raised",
  recipient: pat,
  actor: liam,
  title: "New Refund Request for Test Course",
  body: "Liam Thompson asked for $79.00 back on their Individual Purchase.",
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
            body: "Liam Thompson asked for $79.00 back on their Individual Purchase.",
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

  it("never throws, even when the Knock client can't be built", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("KNOCK_API_KEY", "sk_test_123");
    knockClient.failToBuild = true;

    try {
      await expect(notify([raised])).resolves.toBeUndefined();
      expect(error).toHaveBeenCalled();
    } finally {
      knockClient.failToBuild = false;
      vi.unstubAllEnvs();
      error.mockRestore();
    }
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

describe("knockFeedCredentials", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const configured = {
    KNOCK_PUBLIC_KEY: "pk_test_123",
    KNOCK_FEED_CHANNEL_ID: "feed-channel-uuid",
    KNOCK_SIGNING_KEY: privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
  };

  function decode(token: string) {
    const [header, payload, signature] = token.split(".");
    const verified = createVerify("RSA-SHA256")
      .update(`${header}.${payload}`)
      .verify(publicKey, Buffer.from(signature, "base64url"));
    return {
      verified,
      header: JSON.parse(Buffer.from(header, "base64url").toString()),
      payload: JSON.parse(Buffer.from(payload, "base64url").toString()),
    };
  }

  it("gives a signed-in person their feed keys and an RS256 token valid for an hour", async () => {
    const credentials = await knockFeedCredentials(7, configured);

    expect(credentials).toMatchObject({
      knockPublicKey: "pk_test_123",
      knockFeedChannelId: "feed-channel-uuid",
      knockUserId: "7",
    });
    const token = decode(credentials?.knockUserToken ?? "");
    expect(token.verified).toBe(true);
    expect(token.header.alg).toBe("RS256");
    expect(token.payload.sub).toBe("7");
    expect(token.payload.exp - token.payload.iat).toBe(3600);
  });

  it("gives nothing when nobody is signed in", async () => {
    expect(await knockFeedCredentials(null, configured)).toBeNull();
  });

  it.each(["KNOCK_PUBLIC_KEY", "KNOCK_FEED_CHANNEL_ID", "KNOCK_SIGNING_KEY"])(
    "gives nothing when %s is missing",
    async (missing) => {
      expect(
        await knockFeedCredentials(7, { ...configured, [missing]: "" })
      ).toBeNull();
    }
  );
});
