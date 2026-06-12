import { NextResponse } from "next/server";
import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { createRemoteJWKSet, jwtVerify } from "jose";
import outputs from "@/amplify_outputs.json";

const { aws_region: region, user_pool_id: userPoolId } = (outputs as any).auth;

const cognito = new CognitoIdentityProviderClient({ region });

const JWKS = createRemoteJWKSet(
  new URL(`https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`),
);

async function requireAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  try {
    const { payload } = await jwtVerify(auth.slice(7), JWKS);
    const groups: string[] = (payload["cognito:groups"] as string[]) ?? [];
    return groups.includes("Admin");
  } catch {
    return false;
  }
}

async function listGroupEmails(groupName: string): Promise<string[]> {
  const emails: string[] = [];
  let nextToken: string | undefined;
  do {
    const cmd = new ListUsersInGroupCommand({
      UserPoolId: userPoolId,
      GroupName: groupName,
      Limit: 60,
      ...(nextToken ? { NextToken: nextToken } : {}),
    });
    const res = await cognito.send(cmd);
    for (const user of res.Users ?? []) {
      const emailAttr = user.Attributes?.find((a) => a.Name === "email");
      if (emailAttr?.Value) emails.push(emailAttr.Value.toLowerCase());
    }
    nextToken = res.NextToken;
  } while (nextToken);
  return emails;
}

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [adminEmails, sellerEmails] = await Promise.all([
    listGroupEmails("Admin"),
    listGroupEmails("Seller"),
  ]);

  return NextResponse.json({ admin: adminEmails, seller: sellerEmails });
}
