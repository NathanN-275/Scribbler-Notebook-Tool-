import { auth } from "@clerk/nextjs/server";
import { tutorQuota } from "../../../../lib/tutor-quota";

const headers = { "Cache-Control": "no-store" };

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Sign in to use the AI tutor." }, { status: 401, headers });
  }

  try {
    const { usage } = await tutorQuota(userId);
    return Response.json(usage, { headers });
  } catch {
    return Response.json({ error: "The tutor question limit is temporarily unavailable." }, { status: 503, headers });
  }
}
