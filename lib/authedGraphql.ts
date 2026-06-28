import "@/lib/amplifyclient";
import { fetchAuthSession } from "aws-amplify/auth";
import outputs from "@/amplify_outputs.json";

// Calls an authenticated (Cognito userPool) AppSync GraphQL operation directly,
// passing the user's ID token. Workaround for the Amplify Data client resolving
// custom mutations to apiKey auth in our deployed build ("No api-key configured")
// despite an explicit authMode: "userPool".
export async function authedGraphql<T = any>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const token = (await fetchAuthSession()).tokens?.idToken?.toString();
  if (!token) throw new Error("Your session expired — please sign in again.");

  const res = await fetch((outputs as any).data.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0]?.message || "Request failed");
  }
  return json.data as T;
}
