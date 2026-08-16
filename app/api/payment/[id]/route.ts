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

// UPDATE payment
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { paymentGatewayData } = body;
    const { id } = await params;
    const paymentId = parseInt(id);
    const existing = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Payment gateway not found' }, { status: 404 });
    }

    const incoming = gatewayObject(paymentGatewayData);
    const previous = gatewayObject(existing.paymentGatewayData);
    const type = String(incoming.type || previous.type || '').toUpperCase();
    if (!['MANUAL', 'SSLCOMMERZ'].includes(type)) {
      return NextResponse.json({ error: 'Invalid payment gateway type' }, { status: 400 });
    }
    const mergedGatewayData: Record<string, any> = {
      ...incoming,
      type,
      ...(type === 'SSLCOMMERZ' && !String(incoming.storePassword || '').trim()
        ? { storePassword: previous.storePassword }
        : {}),
    };
    if (type === 'SSLCOMMERZ' && (!String(mergedGatewayData.storeId || '').trim() || !String(mergedGatewayData.storePassword || '').trim())) {
      return NextResponse.json({ error: 'Store ID and Store Password are required' }, { status: 400 });
    }

    const payment = await prisma.payment.update({
      where: { id: paymentId },
      data: {
        paymentGatewayData: mergedGatewayData,
        updatedAt: new Date(),
      },
    });

    const gatewayType =
      typeof paymentGatewayData?.type === 'string'
        ? paymentGatewayData.type
        : typeof existing.paymentGatewayData === 'object' &&
            existing.paymentGatewayData !== null &&
            'type' in (existing.paymentGatewayData as Record<string, unknown>) &&
            typeof (existing.paymentGatewayData as Record<string, unknown>).type === 'string'
          ? (existing.paymentGatewayData as Record<string, string>).type
          : 'PAYMENT';

    await logActivity({
      action: 'update_payment_gateway',
      entity: 'payment',
      entityId: payment.id,
      access,
      request,
      metadata: {
        message: `Payment gateway updated: ${gatewayType}`,
      },
      before: toPaymentLogSnapshot(existing),
      after: toPaymentLogSnapshot(payment),
    });

    return NextResponse.json({ ...payment, paymentGatewayData: redactGatewayData(payment.paymentGatewayData) });
  } catch (error) {
    console.error('Error updating payment:', error);
    return NextResponse.json(
      { error: 'Failed to update payment' },
      { status: 500 }
    );
  }
}

// DELETE payment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const paymentId = parseInt(id);
    const existing = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Payment gateway not found' }, { status: 404 });
    }

    await prisma.payment.delete({
      where: { id: paymentId },
    });

    const gatewayType =
      typeof existing.paymentGatewayData === 'object' &&
      existing.paymentGatewayData !== null &&
      'type' in (existing.paymentGatewayData as Record<string, unknown>) &&
      typeof (existing.paymentGatewayData as Record<string, unknown>).type === 'string'
        ? (existing.paymentGatewayData as Record<string, string>).type
        : 'PAYMENT';

    await logActivity({
      action: 'delete_payment_gateway',
      entity: 'payment',
      entityId: existing.id,
      access,
      request,
      metadata: {
        message: `Payment gateway deleted: ${gatewayType}`,
      },
      before: toPaymentLogSnapshot(existing),
    });

    return NextResponse.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    console.error('Error deleting payment:', error);
    return NextResponse.json(
      { error: 'Failed to delete payment' },
      { status: 500 }
    );
  }
}
