import { data } from "react-router";
import type { Route } from "./+types/api.knock-token";
import { getCurrentUserId } from "~/lib/session";
import { knockClientCredentials } from "~/lib/notifications.server";

// SPIKE: hands the signed-in user a fresh Knock user token when the old one is
// about to expire (KnockProvider's onUserTokenExpiring).
export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) throw data("Not signed in", { status: 401 });

  const credentials = await knockClientCredentials(currentUserId);
  if (!credentials?.knockUserToken) {
    throw data("Knock is not configured", { status: 404 });
  }

  console.log(`[knock-token] signed a fresh token for user ${currentUserId}`);
  return { knockUserId: credentials.knockUserId, token: credentials.knockUserToken };
}
