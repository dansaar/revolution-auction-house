import { NextResponse } from "next/server";

// Payment verification has moved to the verifyPayment Amplify Lambda mutation.
// This endpoint is no longer in use.
export async function POST() {
  return NextResponse.json(
    { error: "This endpoint has been removed. Use the verifyPayment mutation." },
    { status: 410 },
  );
}
