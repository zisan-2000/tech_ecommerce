// app/api/cart/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeWarehouseAvailableStock } from '@/lib/warehouse-stock';

// UPDATE quantity - Logged in user only
// Body: { quantity: number }
// quantity <= 0 hole item delete kore dei
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string } | undefined;
    const userId = user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const cartItemId = Number(id);
    if (Number.isNaN(cartItemId)) {
      return NextResponse.json(
        { error: 'Invalid cart item id' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const quantity = Number(body.quantity);

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: cartItemId },
      include: {
        variant: {
          include: {
            stockLevels: {
              select: { quantity: true, reserved: true },
            },
          },
        },
        product: true,
      },
    });

    if (!cartItem || cartItem.userId !== userId) {
      return NextResponse.json(
        { error: 'Cart item not found' },
        { status: 404 }
      );
    }

    if (!quantity || quantity <= 0) {
      await prisma.cartItem.delete({
        where: { id: cartItemId },
      });
      return NextResponse.json({ message: 'Cart item removed' });
    }

    if (cartItem.product.type === 'PHYSICAL') {
      const available = cartItem.variant
        ? computeWarehouseAvailableStock(cartItem.variant)
        : null;
      if (available === null) {
        return NextResponse.json(
          { error: 'Warehouse inventory is not configured for the selected variant' },
          { status: 400 }
        );
      }
      if (available < quantity) {
        return NextResponse.json(
          { error: 'Requested quantity exceeds available stock' },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity, lastReminderAt: null },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating cart item:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE single item - Logged in user only
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { id?: string } | undefined;
    const userId = user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const cartItemId = Number(id);
    if (Number.isNaN(cartItemId)) {
      return NextResponse.json(
        { error: 'Invalid cart item id' },
        { status: 400 }
      );
    }

    const cartItem = await prisma.cartItem.findUnique({
      where: { id: cartItemId },
    });

    if (!cartItem || cartItem.userId !== userId) {
      return NextResponse.json(
        { error: 'Cart item not found' },
        { status: 404 }
      );
    }

    await prisma.cartItem.delete({
      where: { id: cartItemId },
    });

    return NextResponse.json({ message: 'Cart item removed' });
  } catch (error) {
    console.error('Error deleting cart item:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
