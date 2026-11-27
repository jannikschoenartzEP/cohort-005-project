import { redirect } from "react-router";
import type { Route } from "./+types/api.set-dev-country";
import { setDevCountry } from "~/lib/session";
import { parseDevCountry } from "~/modules/dropdown-choices";

export async function action({ request, url }: Route.ActionArgs) {
  const formData = await request.formData();
  const country = parseDevCountry(formData.get("country"));

  const cookie = await setDevCountry(request, country);

  return redirect(url.searchParams.get("redirectTo") ?? "/", {
    headers: { "Set-Cookie": cookie },
  });
}
