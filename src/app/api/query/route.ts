import { NextRequest, NextResponse } from "next/server";
import { processQuery } from "@/lib/queryEngine";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = body?.query;

    if (!input || typeof input !== "string") {
      return NextResponse.json(
        { error: "Missing 'query' field in request body." },
        { status: 400 }
      );
    }

    const response = await processQuery(input);
    return NextResponse.json({ response });
  } catch (err) {
    console.error("Query API error:", err);
    return NextResponse.json(
      {
        error: "Internal server error.",
        // Surface the real cause in development; hide it in production.
        ...(process.env.NODE_ENV === "development"
          ? { detail: err instanceof Error ? err.message : String(err) }
          : {}),
      },
      { status: 500 }
    );
  }
}
