'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/components/ecommarce/CartContext';
import { toast } from 'sonner';

interface Product {
  id: number;
  name: string;
  price: number;
  original_price: number | null;
  discount: number;
  image: string | null;
  writer: {
    name: string;
  } | null;
  slug: string;
}

export function TopSellingBooks() {
  const [books, setBooks] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { addToCart } = useCart();

  useEffect(() => {
    const fetchTopSellingBooks = async () => {
      try {
        const response = await fetch('/api/products/top-selling');
        if (!response.ok) {
          throw new Error('Failed to fetch top selling books');
        }
        const data = await response.json();
        setBooks(data);
      } catch (error) {
        console.error('Error fetching top selling books:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTopSellingBooks();
  }, []);

  const handleAddToCart = (book: Product) => {
    addToCart(book.id, 1);
    toast.success('পণ্যটি কার্টে যোগ করা হয়েছে');
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-40 bg-gray-200 rounded-lg"></div>
            <div className="mt-2 h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="mt-1 h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        ))}
      </div>
    );
  }

  if (books.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4 mt-10">
      <h3 className="text-lg font-semibold text-center mb-4">সর্বাধিক বিক্রিত বই</h3>
      {books.map((book) => (
        <div key={book.id} className="rounded-lg border border-border bg-card p-3 text-card-foreground shadow-sm transition-shadow hover:shadow-md">
          <Link href={`/ecommerce/books/${book.slug}`} className="block">
            <div className="flex gap-3">
              <div className="w-20 h-24 relative flex-shrink-0">
                <Image
                  src={book.image || '/images/placeholder-book.jpg'}
                  alt={book.name}
                  fill
                  className="object-cover rounded"
                />
              </div>
              <div className="flex-1">
                <h4 className="font-medium text-sm line-clamp-2">{book.name}</h4>
                {book.writer && (
                  <p className="text-xs text-gray-500 mt-1">{book.writer.name}</p>
                )}
                <div className="mt-2">
                  <span className="font-bold text-primary">
                    ৳{Number(book.price).toFixed(2)}
                  </span>
                  {book.original_price && Number(book.original_price) > Number(book.price) && (
                    <span className="text-xs text-gray-500 line-through ml-2">
                      ৳{Number(book.original_price).toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Link>
          <Button
            size="sm"
            className="w-full mt-2 text-xs"
            onClick={() => handleAddToCart(book)}
          >
            <ShoppingCart className="h-4 w-4 mr-1" />
            কার্টে যোগ করুন
          </Button>
        </div>
      ))}
    </div>
  );
}
