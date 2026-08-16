import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { logActivity } from '@/lib/activity-log';
import { getAccessContext } from '@/lib/rbac';

function toPaymentLogSnapshot(payment: {
  id: number;
  orderId?: number | null;
  amount?: unknown;
  paymentGatewayData: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: payment.id,
    orderId: payment.orderId ?? null,
    amount: payment.amount === null || payment.amount === undefined ? null : Number(payment.amount),
    paymentGatewayData: redactGatewayData(payment.paymentGatewayData),
    createdAt: payment.createdAt?.toISOString() ?? null,
    updatedAt: payment.updatedAt?.toISOString() ?? null,
  };
}

function gatewayObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function redactGatewayData(value: unknown) {
  const data = gatewayObject(value);
  if (String(data.type || '').toUpperCase() !== 'SSLCOMMERZ') return data;
  const { storePassword: _secret, ...safe } = data;
  return { ...safe, hasStorePassword: Boolean(data.storePassword) };
}

function adminPayment(payment: any) {
  return { ...payment, paymentGatewayData: redactGatewayData(payment.paymentGatewayData) };
}

// GET all payments
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.hasAny(['settings.payment.manage', 'settings.manage'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payments = await prisma.payment.findMany({
      where: { orderId: null },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ payments: payments.map(adminPayment) });
  } catch (error) {
    console.error('Error fetching payments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payments' },
      { status: 500 }
    );
  }
}

// CREATE new payment
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.hasAny(['settings.payment.manage', 'settings.manage'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { paymentGatewayData, orderId, amount } = body;
    const gatewayData = gatewayObject(paymentGatewayData);
    const gatewayType = String(gatewayData.type || '').toUpperCase();
    if (!['MANUAL', 'SSLCOMMERZ'].includes(gatewayType)) {
      return NextResponse.json({ error: 'Invalid payment gateway type' }, { status: 400 });
    }
    if (gatewayType === 'SSLCOMMERZ' && (!String(gatewayData.storeId || '').trim() || !String(gatewayData.storePassword || '').trim())) {
      return NextResponse.json({ error: 'Store ID and Store Password are required' }, { status: 400 });
    }

    const payment = await prisma.payment.create({
      data: {
        ...(orderId && { orderId }),
        ...(amount && { amount }),
        paymentGatewayData: { ...gatewayData, type: gatewayType },
      },
    });

    await logActivity({
      action: 'create_payment_gateway',
      entity: 'payment',
      entityId: payment.id,
      access,
      request,
      metadata: {
        message: `Payment gateway created: ${gatewayType}`,
      },
      after: toPaymentLogSnapshot(payment),
    });

    return NextResponse.json(adminPayment(payment), { status: 201 });
  } catch (error) {
    console.error('Error creating payment:', error);
    return NextResponse.json(
      { error: 'Failed to create payment' },
      { status: 500 }
    );
  }
}
