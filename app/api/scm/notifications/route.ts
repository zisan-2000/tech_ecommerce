import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getAccessContext } from "@/lib/rbac";
import {
  getScmInternalNotifications,
  getScmNotificationDeliveryHealth,
  markAllScmInternalNotificationsRead,
  markScmInternalNotificationRead,
  processScmNotificationEmailQueue,
  SCM_INTERNAL_NOTIFICATION_TYPES,
  type ScmInternalNotificationType,
} from "@/lib/scm-internal-notifications";

function toPositiveInt(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function isScmNotificationType(value: unknown): value is ScmInternalNotificationType {
  return (
    typeof value === "string" &&
    (SCM_INTERNAL_NOTIFICATION_TYPES as readonly string[]).includes(value)
  );
}

async function resolveAccess() {
  const session = await getServerSession(authOptions);
  const access = await getAccessContext(
    session?.user as { id?: string; role?: string } | undefined,
  );

  const userId = access.userId;
  if (!userId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!access.hasAny(["scm.access"])) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, access, userId };
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveAccess();
    if (!resolved.ok) return resolved.response;

    const unreadOnly = request.nextUrl.searchParams.get("unreadOnly") === "true";
    const limit = toPositiveInt(request.nextUrl.searchParams.get("limit"));

    const payload = await getScmInternalNotifications({
      userId: resolved.userId,
      unreadOnly,
      limit: limit ?? 50,
    });

    const health = await getScmNotificationDeliveryHealth(resolved.userId);

    return NextResponse.json({
      ...payload,
      health,
    });
  } catch (error) {
    console.error("SCM INTERNAL NOTIFICATIONS GET ERROR:", error);
    return NextResponse.json(
      { error: "Failed to load SCM notifications." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveAccess();
    if (!resolved.ok) return resolved.response;

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
    };

    const action =
      typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
    if (!["process_email_queue", "retry_failed_email_queue"].includes(action)) {
      return NextResponse.json({ error: "Invalid action." }, { status: 400 });
    }

    const result = await processScmNotificationEmailQueue({
      includeFailed: action === "retry_failed_email_queue",
    });

    return NextResponse.json({
      ok: true,
      action,
      result,
    });
  } catch (error) {
    console.error("SCM INTERNAL NOTIFICATIONS POST ERROR:", error);
    return NextResponse.json(
      { error: "Failed to process SCM notification queue." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const resolved = await resolveAccess();
    if (!resolved.ok) return resolved.response;

    const body = (await request.json().catch(() => ({}))) as {
      id?: unknown;
      type?: unknown;
      markAll?: unknown;
    };

    if (Boolean(body.markAll)) {
      await markAllScmInternalNotificationsRead(resolved.userId);
      return NextResponse.json({ ok: true });
    }

    const id = toPositiveInt(body.id);
    if (!id || !isScmNotificationType(body.type)) {
      return NextResponse.json(
        { error: "Notification type and id are required." },
        { status: 400 },
      );
    }

    const result = await markScmInternalNotificationRead({
      userId: resolved.userId,
      type: body.type,
      id,
    });

    if (result.count === 0) {
      return NextResponse.json(
        { error: "Notification not found." },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, id, type: body.type });
  } catch (error) {
    console.error("SCM INTERNAL NOTIFICATIONS PATCH ERROR:", error);
    return NextResponse.json(
      { error: "Failed to update SCM notification state." },
      { status: 500 },
    );
  }
}
