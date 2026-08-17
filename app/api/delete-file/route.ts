import { NextResponse } from 'next/server';
import { unlink } from 'fs/promises';
import path from 'path';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getAccessContext } from '@/lib/rbac';

const DELETE_FILE_PERMISSIONS = [
  'products.manage',
  'blogs.manage',
  'gallery.manage',
  'settings.manage',
  'suppliers.manage',
  'purchase_requisitions.manage',
  'material_requests.manage',
  'goods_receipts.manage',
  'delivery-men.manage',
  'logistics.manage',
] as const;

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const access = await getAccessContext(
      session?.user as { id?: string; role?: string } | undefined,
    );
    if (!access.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!access.hasAny([...DELETE_FILE_PERMISSIONS])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const requestedPath = searchParams.get('path')?.replace(/\\/g, '/');

    if (!requestedPath) {
      return NextResponse.json(
        { error: 'File path is required' },
        { status: 400 }
      );
    }

    const normalizedPath = requestedPath.replace(/^\/+/, '');
    if (!normalizedPath.startsWith('upload/') || normalizedPath.includes('..')) {
      return NextResponse.json(
        { error: 'Invalid file path' },
        { status: 400 }
      );
    }

    const uploadRoot = path.resolve(process.cwd(), 'public', 'upload');
    const fullPath = path.resolve(process.cwd(), 'public', normalizedPath);
    if (!fullPath.startsWith(`${uploadRoot}${path.sep}`)) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
    }

    await unlink(fullPath);
    
    return NextResponse.json({ 
      success: true,
      message: 'File deleted successfully' 
    });
    
  } catch (error: unknown) {
    if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      // File not found, but we'll still return success since the goal is to have the file deleted
      return NextResponse.json({ 
        success: true,
        message: 'File not found (already deleted?)' 
      });
    }
    
    console.error('Error deleting file:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to delete file',
      },
      { status: 500 }
    );
  }
}

// Add this to prevent Next.js from caching the response
export const dynamic = 'force-dynamic';
