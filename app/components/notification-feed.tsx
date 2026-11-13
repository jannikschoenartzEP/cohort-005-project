import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import {
  KnockFeedProvider,
  KnockProvider,
  NotificationFeedPopover,
  NotificationIconButton,
  useKnockFeed,
} from "@knocklabs/react";
import "@knocklabs/react/dist/index.css";

// SPIKE (spike/knock-round-trip, never merged): the bell, feed and toasts.

export type KnockCredentials = {
  knockPublicKey: string;
  feedChannelId: string;
  knockUserId: string;
  knockUserToken: string | null;
};

export function NotificationFeed({ credentials }: { credentials: KnockCredentials }) {
  // KnockProvider authenticates during render, so keep it idle until hydrated.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Stable across renders: an inline arrow would re-run setup with a stale token.
  const onUserTokenExpiring = useCallback(async () => {
    console.log("[knock] token expiring, fetching a fresh one");
    const response = await fetch("/api/knock-token");
    if (!response.ok) return;
    const { token } = (await response.json()) as { token: string };
    console.log("[knock] got a fresh token");
    return token;
  }, []);

  return (
    <KnockProvider
      apiKey={credentials.knockPublicKey}
      user={{ id: credentials.knockUserId }}
      userToken={credentials.knockUserToken ?? undefined}
      onUserTokenExpiring={onUserTokenExpiring}
      identificationStrategy="skip"
      enabled={hydrated}
      logLevel="debug"
    >
      <KnockFeedProvider feedId={credentials.feedChannelId}>
        <Bell />
      </KnockFeedProvider>
    </KnockProvider>
  );
}

function Bell() {
  const [isVisible, setIsVisible] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { feedClient } = useKnockFeed();
  const navigate = useNavigate();

  useEffect(() => {
    const onRealtime = ({ items }: { items: Array<{ data: Record<string, unknown> | null }> }) => {
      for (const item of items) {
        const title = String(item.data?.title ?? "New notification");
        const link = item.data?.link ? String(item.data.link) : null;
        console.log("[knock] real-time item received", item);
        toast(title, {
          description: item.data?.body ? String(item.data.body) : undefined,
          action: link ? { label: "View", onClick: () => navigate(link) } : undefined,
        });
      }
    };
    feedClient.on("items.received.realtime", onRealtime);
    return () => feedClient.off("items.received.realtime", onRealtime);
  }, [feedClient, navigate]);

  return (
    <>
      <NotificationIconButton
        ref={buttonRef}
        onClick={() => setIsVisible((v) => !v)}
      />
      <NotificationFeedPopover
        buttonRef={buttonRef as React.RefObject<HTMLElement>}
        isVisible={isVisible}
        onClose={() => setIsVisible(false)}
      />
    </>
  );
}
