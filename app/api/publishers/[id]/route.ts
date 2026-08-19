import { NextResponse } from "next/server";

function gone() {
  return NextResponse.json(
    { error: "This legacy catalog resource is no longer available." },
    {
      status: 410,
      headers: { "Cache-Control": "public, max-age=86400, immutable" },
    },
  );
}

export { gone as GET, gone as POST, gone as PUT, gone as PATCH, gone as DELETE };

