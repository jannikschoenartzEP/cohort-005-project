import { data } from "react-router";
import type { Route } from "./+types/api.knock-token";
import { getCurrentUserId } from "~/lib/session";
import { knockFeedCredentials } from "~/lib/notifications.server";

/** A fresh Knock user token for the session user, before the old one expires. */
export async function loader({ request }: Route.LoaderArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (currentUserId === null) {
    throw data("Select a user from the DevUI panel.", { status: 401 });
  }
  const credentials = await knockFeedCredentials(currentUserId);
  if (!credentials) {
    throw data("Knock is not configured", { status: 404 });
  }
  return { token: credentials.knockUserToken };
}
