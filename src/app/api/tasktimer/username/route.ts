import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminFirestore } from "@/lib/firebaseAdminFirestore";
import { normalizeUsername, validateUsername } from "@/lib/username";

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get("username") || "";
  const usernameKey = normalizeUsername(username);
  const error = validateUsername(username);

  if (error) {
    return NextResponse.json({
      available: false,
      usernameKey,
      error,
    });
  }

  const firestore = getFirebaseAdminFirestore();
  if (!firestore) {
    return NextResponse.json(
      {
        available: false,
        usernameKey,
        error: "Unable to check username availability right now.",
      },
      { status: 500 }
    );
  }

  try {
    const snapshot = await firestore.collection("usernames").doc(usernameKey).get();
    return NextResponse.json({
      available: !snapshot.exists,
      usernameKey,
      error: null,
    });
  } catch {
    return NextResponse.json(
      {
        available: false,
        usernameKey,
        error: "Unable to check username availability right now.",
      },
      { status: 500 }
    );
  }
}
