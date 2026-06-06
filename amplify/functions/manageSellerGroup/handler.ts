import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID!;

export const handler = async (event: any) => {
  const groups: string[] =
    event.identity?.claims?.["cognito:groups"] ?? [];

  if (!groups.includes("Admin")) {
    return { success: false, message: "Admin access required." };
  }

  const email: string = (event.arguments?.email ?? "").trim().toLowerCase();
  const action: string = event.arguments?.action ?? "";

  if (!email || (action !== "add" && action !== "remove")) {
    return { success: false, message: "Invalid arguments." };
  }

  const listResult = await cognito.send(
    new ListUsersCommand({
      UserPoolId: USER_POOL_ID,
      Filter: `email = "${email}"`,
      Limit: 1,
    }),
  );

  const cognitoUser = listResult.Users?.[0];

  if (!cognitoUser?.Username) {
    return {
      success: false,
      message:
        "No Cognito account found for that email. The seller must sign up first.",
    };
  }

  if (action === "add") {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: cognitoUser.Username,
        GroupName: "Seller",
      }),
    );
    return { success: true, message: `${email} added to Seller group.` };
  } else {
    await cognito.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: cognitoUser.Username,
        GroupName: "Seller",
      }),
    );
    return { success: true, message: `${email} removed from Seller group.` };
  }
};
