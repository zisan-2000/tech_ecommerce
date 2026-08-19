import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { getAccessContext } from "@/lib/rbac";
import { getSiteSettingsForSeo } from "@/lib/seo";

// ----------- SMTP CONFIG -------------
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM_EMAIL || SMTP_USER;

if (!SMTP_USER || !SMTP_PASS) {
  console.error("❌ Missing SMTP_USER or SMTP_PASS in .env");
}

// Create Gmail SMTP Transport
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: true,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
});
// -------------------------------------

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "http://localhost:3000"
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!access.has("newsletter.manage")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ✅ AWAIT params
    const { id } = await params;

    // 1) Check SMTP Config
    if (!SMTP_USER || !SMTP_PASS) {
      return NextResponse.json(
        { error: "SMTP not configured. Add SMTP_USER + SMTP_PASS in .env." },
        { status: 500 }
      );
    }

    // 2) Fetch Newsletter
    const newsletter = await prisma.newsletter.findUnique({
      where: { id },
    });

    if (!newsletter)
      return NextResponse.json({ error: "Newsletter not found" }, { status: 404 });

    if (newsletter.status === "sent") {
      return NextResponse.json(
        { error: "Newsletter already sent." },
        { status: 400 }
      );
    }

    // 3) Load Subscribers
    const subscribers = await prisma.newsletterSubscriber.findMany({
      where: { status: "subscribed" },
      select: { email: true },
    });

    if (subscribers.length === 0) {
      return NextResponse.json({ error: "No subscribers found." }, { status: 404 });
    }

    const settings = await getSiteSettingsForSeo();

    // 4) Email HTML
    const buildEmailHTML = (email: string) => `
      <div style="font-family: Arial; max-width: 600px; margin: auto; padding: 20px;">
        <div style="background:#086666; color:#fff; padding:20px; border-radius:8px;">
          <h1>${newsletter.title}</h1>
          <p>${settings.siteTitle} - Newsletter</p>
        </div>

        <div style="background:#F4F8F7; padding:20px; margin-top:20px; border-radius:8px;">
          <div style="white-space: pre-wrap; color:#0D1414;">
            ${newsletter.content}
          </div>
        </div>

        <div style="background:#0E4B4B; color:#fff; padding:15px; margin-top:20px; border-radius:8px; text-align:center;">
          <p>এই ইমেইলটি আপনার সাবস্ক্রিপশনের কারণে পাঠানো হয়েছে</p>
          <p>
            <a href="${getBaseUrl()}/api/newsletter/unsubscribe?email=${encodeURIComponent(
              email
            )}" style="color:#fff; text-decoration:underline;">সাবস্ক্রিপশন বাতিল করুন</a>
          </p>
        </div>
      </div>
    `;

    // 5) Send Emails (1/sec)
    let successCount = 0;
    let failureCount = 0;
    const errors: any[] = [];

    for (let i = 0; i < subscribers.length; i++) {
      const email = subscribers[i].email;
      const html = buildEmailHTML(email);

      try {
        await transporter.sendMail({
          from: SMTP_FROM,
          to: email,
          subject: newsletter.subject,
          html,
          text: newsletter.content,
        });

        console.log(`✓ Sent: ${email}`);
        successCount++;
      } catch (err: any) {
        console.error(`✗ Failed: ${email}`, err.message);
        failureCount++;
        errors.push({ email, error: err.message });
      }

      // Gmail rate-limit protection
      if (i < subscribers.length - 1) {
        await new Promise((res) => setTimeout(res, 900));
      }
    }

    // 6) Mark newsletter as sent
    const sentNewsletter = await prisma.newsletter.update({
      where: { id },
      data: { status: "sent", sentAt: new Date() },
    });

    await logActivity({
      action: "send_newsletter",
      entity: "newsletter",
      entityId: sentNewsletter.id,
      access,
      request: req,
      metadata: {
        message: `Newsletter sent: ${sentNewsletter.title}`,
        recipients: subscribers.length,
        delivered: successCount,
        failed: failureCount,
      },
      before: {
        status: newsletter.status,
        sentAt: newsletter.sentAt?.toISOString() ?? null,
      },
      after: {
        status: sentNewsletter.status,
        sentAt: sentNewsletter.sentAt?.toISOString() ?? null,
      },
    });

    // 7) Return result
    return NextResponse.json({
      success: failureCount === 0,
      total: subscribers.length,
      sent: successCount,
      failed: failureCount,
      errors: failureCount ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Newsletter SMTP Error:", error.message);
    return NextResponse.json(
      { error: "SMTP send failed", details: error.message },
      { status: 500 }
    );
  }
}
