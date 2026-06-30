import {
  CognitoIdentityProviderClient,
  ListUsersInGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";

// Cognito admin reads must run in a Lambda (with an execution role + IAM grant),
// not a Next.js SSR route — the hosted SSR runtime has no AWS credentials.
const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID!;

async function listGroupEmails(groupName: string): Promise<string[]> {
  const emails: string[] = [];
  let nextToken: string | undefined;
  do {
    const res = await cognito.send(
      new ListUsersInGroupCommand({
        UserPoolId: USER_POOL_ID,
        GroupName: groupName,
        Limit: 60,
        ...(nextToken ? { NextToken: nextToken } : {}),
      }),
    );
    for (const user of res.Users ?? []) {
      const emailAttr = user.Attributes?.find((a) => a.Name === "email");
      if (emailAttr?.Value) emails.push(emailAttr.Value.toLowerCase());
    }
    nextToken = res.NextToken;
  } while (nextToken);
  return emails;
}

export const handler = async (event: any) => {
  const groups: string[] = event.identity?.claims?.["cognito:groups"] ?? [];
  if (!groups.includes("Admin")) {
    return { admin: [], seller: [], error: "Admin access required." };
  }

  try {
    const [admin, seller] = await Promise.all([
      listGroupEmails("Admin"),
      listGroupEmails("Seller"),
    ]);
    return { admin, seller, error: null };
  } catch (err: any) {
    console.error("LIST_GROUP_MEMBERS_ERROR", err?.message || err);
    return { admin: [], seller: [], error: "Could not list group members." };
  }
};
