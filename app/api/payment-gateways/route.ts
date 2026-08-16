import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET available payment gateways (public endpoint for checkout)
export async function GET(request: NextRequest) {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        orderId: null,
      },
      select: {
        id: true,
        paymentGatewayData: true,
        // Only return necessary fields for checkout
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform data to only include gateway information
    const gateways = payments.reduce<Array<{
      id: number;
      paymentGatewayData: Record<string, unknown>;
    }>>((list, payment) => {
      const raw = payment.paymentGatewayData;
      const data = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : {};
      if (data.isActive === false) return list;

      const type = String(data.type || '').toUpperCase();
      if (type === 'SSLCOMMERZ') {
        list.push({
          id: payment.id,
          paymentGatewayData: {
            type: 'SSLCOMMERZ',
            sandbox: Boolean(data.sandbox),
          },
        });
        return list;
      }
      if (type === 'MANUAL') {
        list.push({
          id: payment.id,
          paymentGatewayData: {
            type: 'MANUAL',
            channel: String(data.channel || 'Manual Payment'),
            accountNumbers: Array.isArray(data.accountNumbers)
              ? data.accountNumbers.map(String)
              : [],
          },
        });
        return list;
      }
      return list;
    }, []);

    // If no payment gateways are configured, return empty array
    // The frontend will always show Cash On Delivery as default
    return NextResponse.json({ gateways });
  } catch (error) {
    console.error('Error fetching payment gateways:', error);
    // Even on error, return empty array so checkout doesn't break
    return NextResponse.json({ gateways: [] });
  }
}
