import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { setCurrentUserId } from "~/lib/session";
import { loader } from "./api.knock-token";

function callLoader(request: Request) {
  const url = new URL(request.url);
  return loader({
    request,
    url,
    params: {},
    context: {},
    pattern: "/api/knock-token",
  } as Parameters<typeof loader>[0]);
}

describe("/api/knock-token", () => {
  it("refuses with 401 when nobody is signed in", async () => {
    const response = await callLoader(
      new Request("http://localhost/api/knock-token")
    ).catch((error: unknown) => error);

    expect(response).toMatchObject({ init: { status: 401 } });
  });

  it("signs a fresh token for the session user", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv("KNOCK_PUBLIC_KEY", "pk_test_123");
    vi.stubEnv("KNOCK_FEED_CHANNEL_ID", "feed-channel-uuid");
    vi.stubEnv(
      "KNOCK_SIGNING_KEY",
      privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    );
    const signIn = new Request("http://localhost/");
    const cookie = await setCurrentUserId(signIn, 7);

    const { token } = await callLoader(
      new Request("http://localhost/api/knock-token", {
        headers: { Cookie: cookie },
      })
    );

    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString()
    );
    expect(payload.sub).toBe("7");
    vi.unstubAllEnvs();
  });
});
