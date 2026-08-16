// app/api/site/route.ts

import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { getAccessContext } from "@/lib/rbac";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isStorefrontRequest, privateJson, publicJson } from "@/lib/public-cache";

function toSiteSettingsLogSnapshot(settings: {
  id: number;
  logo: string | null;
  siteTitle: string | null;
  footerDescription: string | null;
  contactNumber: string | null;
  contactEmail: string | null;
  address: string | null;
  facebookLink: string | null;
  instagramLink: string | null;
  twitterLink: string | null;
  tiktokLink: string | null;
  youtubeLink: string | null;
}) {
  return {
    id: settings.id,
    logo: settings.logo,
    siteTitle: settings.siteTitle,
    footerDescription: settings.footerDescription,
    contactNumber: settings.contactNumber,
    contactEmail: settings.contactEmail,
    address: settings.address,
    facebookLink: settings.facebookLink,
    instagramLink: settings.instagramLink,
    twitterLink: settings.twitterLink,
    tiktokLink: settings.tiktokLink,
    youtubeLink: settings.youtubeLink,
  };
}

/* =========================
   GET SITE SETTINGS
========================= */
export async function GET(req: Request) {
  try {
    const settings = await prisma.sitesettings.findFirst({
      orderBy: { id: "asc" },
    });

    if (!settings) {
      const created = await prisma.sitesettings.create({
        data: {
          logo: null,
          siteTitle: null,
          footerDescription: null,
          contactNumber: null,
          contactEmail: null,
          address: null,
          facebookLink: null,
          instagramLink: null,
          twitterLink: null,
          tiktokLink: null,
          youtubeLink: null,
        },
      });

      return isStorefrontRequest(req)
        ? publicJson(created, { maxAge: 300, staleWhileRevalidate: 3600 })
        : privateJson(created);
    }

    return isStorefrontRequest(req)
      ? publicJson(settings, { maxAge: 300, staleWhileRevalidate: 3600 })
      : privateJson(settings);
  } catch (error) {
    console.error("GET site settings error:", error);
    return NextResponse.json(
      { error: "Failed to fetch site settings" },
      { status: 500 },
    );
  }
}

/* =========================
   CREATE / UPDATE SITE SETTINGS
========================= */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("settings.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      logo,
      siteTitle,
      footerDescription,
      contactNumber,
      contactEmail,
      address,
      facebookLink,
      instagramLink,
      twitterLink,
      tiktokLink,
      youtubeLink,
    } = body;

    const existingSettings = await prisma.sitesettings.findFirst({
      orderBy: { id: "asc" },
    });

    if (!existingSettings) {
      const created = await prisma.sitesettings.create({
        data: {
          logo: logo ?? null,
          siteTitle: siteTitle ?? null,
          footerDescription: footerDescription ?? null,
          contactNumber: contactNumber ?? null,
          contactEmail: contactEmail ?? null,
          address: address ?? null,
          facebookLink: facebookLink ?? null,
          instagramLink: instagramLink ?? null,
          twitterLink: twitterLink ?? null,
          tiktokLink: tiktokLink ?? null,
          youtubeLink: youtubeLink ?? null,
        },
      });

      await logActivity({
        action: "create_site_settings",
        entity: "settings",
        entityId: created.id,
        access,
        request: req,
        metadata: {
          message: "General settings created",
        },
        after: toSiteSettingsLogSnapshot(created),
      });

      revalidateTag("site-settings", "max");
      return privateJson(created);
    }

    const updated = await prisma.sitesettings.update({
      where: { id: existingSettings.id },
      data: {
        logo: logo ?? null,
        siteTitle: siteTitle ?? null,
        footerDescription: footerDescription ?? null,
        contactNumber: contactNumber ?? null,
        contactEmail: contactEmail ?? null,
        address: address ?? null,
        facebookLink: facebookLink ?? null,
        instagramLink: instagramLink ?? null,
        twitterLink: twitterLink ?? null,
        tiktokLink: tiktokLink ?? null,
        youtubeLink: youtubeLink ?? null,
      },
    });

    await logActivity({
      action: "update_site_settings",
      entity: "settings",
      entityId: updated.id,
      access,
      request: req,
      metadata: {
        message: "General settings updated",
      },
      before: toSiteSettingsLogSnapshot(existingSettings),
      after: toSiteSettingsLogSnapshot(updated),
    });

    revalidateTag("site-settings", "max");
    return privateJson(updated);
  } catch (error) {
    console.error("POST site settings error:", error);
    return NextResponse.json(
      { error: "Failed to update site settings" },
      { status: 500 },
    );
  }
}

/* =========================
   DELETE SITE SETTINGS
========================= */
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("settings.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const settings = await prisma.sitesettings.findFirst({
      orderBy: { id: "asc" },
    });

    if (!settings) {
      return NextResponse.json({ message: "Nothing to delete" });
    }

    const updated = await prisma.sitesettings.update({
      where: { id: settings.id },
      data: {
        logo: null,
        siteTitle: null,
        footerDescription: null,
        contactNumber: null,
        contactEmail: null,
        address: null,
        facebookLink: null,
        instagramLink: null,
        twitterLink: null,
        tiktokLink: null,
        youtubeLink: null,
      },
    });

    await logActivity({
      action: "reset_site_settings",
      entity: "settings",
      entityId: updated.id,
      access,
      request: req,
      metadata: {
        message: "General settings reset",
      },
      before: toSiteSettingsLogSnapshot(settings),
      after: toSiteSettingsLogSnapshot(updated),
    });

    revalidateTag("site-settings", "max");
    return privateJson(updated);
  } catch (error) {
    console.error("DELETE site settings error:", error);
    return NextResponse.json(
      { error: "Failed to delete site settings" },
      { status: 500 },
    );
  }
}
