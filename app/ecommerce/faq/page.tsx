"use client";

import { useMemo, useState, Suspense } from "react";
import {
  Search,
  ChevronDown,
  ChevronUp,
  Package,
  ShoppingCart,
  Truck,
  Shield,
  Clock,
  Mail,
  Phone,
  User,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type FAQItem = { id: string; question: string; answer: string };
type FAQCategory = {
  id: string;
  title: string;
  icon: any;
  questions: FAQItem[];
};

function FAQPageContent() {
  const [openCategory, setOpenCategory] = useState<string | null>("general");
  const [searchTerm, setSearchTerm] = useState("");
  const [openItems, setOpenItems] = useState<Set<string>>(new Set(["general-1"]));

  const toggleCategory = (category: string) => {
    setOpenCategory((prev) => (prev === category ? null : category));
  };

  const toggleItem = (itemId: string) => {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const faqCategories: FAQCategory[] = [
    {
      id: "general",
      title: "General Information",
      icon: Package,
      questions: [
        {
          id: "general-1",
          question: "What can I buy from this store?",
          answer:
            "We focus on computers, components, accessories, monitors, networking equipment, office technology, cameras, gadgets and related technology products.",
        },
        {
          id: "general-2",
          question: "How large is your product collection?",
          answer:
            "Our product collection continues to grow and is updated regularly. You will find new arrivals and updated inventory frequently.",
        },
        {
          id: "general-3",
          question: "How can I confirm product compatibility?",
          answer:
            "Compare the model, interface, dimensions, socket, power and platform requirements shown in the specifications. Contact support before ordering if compatibility is unclear.",
        },
        {
          id: "general-4",
          question: "How do I create an account?",
          answer:
            "Click “Login / Sign Up” from the top-right corner of the website. Then choose “Register” and create an account using your name, email, and password.",
        },
      ],
    },
    {
      id: "ordering",
      title: "Ordering & Payments",
      icon: ShoppingCart,
      questions: [
        {
          id: "ordering-1",
          question: "Do I need an account to place an order?",
          answer:
            "No. You can place an order as a guest. However, creating an account helps you track orders easily and access additional features.",
        },
        {
          id: "ordering-2",
          question: "Which payment methods do you support?",
          answer:
            "We support common local and online payment options such as mobile financial services, bank cards (Visa/MasterCard), and Cash on Delivery (where available).",
        },
        {
          id: "ordering-3",
          question: "Can I cancel my order?",
          answer:
            "Yes, you can cancel your order before it is shipped. Go to your account area and manage your order from the order list.",
        },
        {
          id: "ordering-4",
          question: "Is my payment secure?",
          answer:
            "Yes. We use secure encryption and trusted payment gateways. Sensitive payment information is not stored on our servers.",
        },
        {
          id: "ordering-5",
          question: "How will I receive order confirmation?",
          answer:
            "You will receive confirmation via email and/or SMS after placing the order. You can also track the order status from your account.",
        },
      ],
    },
    {
      id: "shipping",
      title: "Delivery & Shipping",
      icon: Truck,
      questions: [
        {
          id: "shipping-1",
          question: "How much is the delivery charge?",
          answer:
            "Delivery charge depends on your order amount and delivery area. Some orders may qualify for free delivery based on ongoing offers and thresholds.",
        },
        {
          id: "shipping-2",
          question: "How long does delivery take?",
          answer:
            "Delivery time depends on location. Typically, city deliveries take 1–2 business days, outside city 3–5 business days, and remote areas may take 5–7 business days.",
        },
        {
          id: "shipping-3",
          question: "Do you deliver nationwide?",
          answer:
            "Yes. We deliver across Bangladesh, including many remote areas, depending on courier coverage.",
        },
        {
          id: "shipping-4",
          question: "How can I track my order?",
          answer:
            "Go to your account’s “My Orders” section to track status. You may also receive updates via SMS/email.",
        },
        {
          id: "shipping-5",
          question: "Do you offer express delivery?",
          answer:
            "Yes, express delivery may be available in select areas with additional charges. Availability can vary by location and time.",
        },
      ],
    },
    {
      id: "returns",
      title: "Returns & Refunds",
      icon: Shield,
      questions: [
        {
          id: "returns-1",
          question: "Can I return a product?",
          answer:
            "Yes. If the product is damaged, incorrect, or has a manufacturing/quality issue, you can request a return within the return window (as per policy). The product must remain unused where applicable.",
        },
        {
          id: "returns-2",
          question: "How does the refund process work?",
          answer:
            "Once the return is approved and processed, refunds are issued within 5–7 business days (timing may vary by payment method).",
        },
        {
          id: "returns-3",
          question: "Can I exchange a product?",
          answer:
            "Yes. Exchanges may be available for the same product or an equivalent value alternative, depending on stock and policy.",
        },
      ],
    },
    {
      id: "account",
      title: "Account & Profile",
      icon: User,
      questions: [
        {
          id: "account-1",
          question: "I forgot my password—what should I do?",
          answer:
            "On the login page, click “Forgot Password”, enter your registered email, and follow the instructions to reset your password.",
        },
        {
          id: "account-2",
          question: "How do I update my profile?",
          answer:
            "Go to “My Account” → “Edit Profile” to update your information anytime.",
        },
        {
          id: "account-3",
          question: "How can I view my order history?",
          answer:
            "Go to “My Account” → “My Orders” to view and manage your past and current orders.",
        },
        {
          id: "account-4",
          question: "What is Wishlist?",
          answer:
            "Wishlist allows you to save products you may want to buy later. Click the heart icon on a product to add it to your wishlist.",
        },
      ],
    },
    {
      id: "products",
      title: "Products",
      icon: Package,
      questions: [
        {
          id: "products-1",
          question: "How can I check product availability?",
          answer:
            "Availability is shown on each product card and on the product details page. If a product is out of stock, it will show as “Out of Stock”.",
        },
        {
          id: "products-2",
          question: "What if a product is out of stock?",
          answer:
            "If a product is out of stock, you won’t be able to add it to cart. You can check back later when it becomes available again.",
        },
        {
          id: "products-3",
          question: "Do products have warranty?",
          answer:
            "Warranty depends on the product and brand. Warranty information (if applicable) is shown in product details or can be confirmed with support.",
        },
        {
          id: "products-4",
          question: "I can't find a specific product—what can I do?",
          answer:
            "Use the search bar with keywords, or browse by categories. If you still can’t find it, contact support and we’ll try to help.",
        },
      ],
    },
  ];

  const filteredCategories = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!t) return faqCategories;

    return faqCategories
      .map((category) => ({
        ...category,
        questions: category.questions.filter(
          (q) =>
            q.question.toLowerCase().includes(t) ||
            q.answer.toLowerCase().includes(t),
        ),
      }))
      .filter((category) => category.questions.length > 0);
  }, [faqCategories, searchTerm]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative py-20 bg-gradient-to-r from-primary to-primary/80">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-primary-foreground mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-xl text-primary-foreground/90 max-w-2xl mx-auto mb-8">
            Find answers to common questions about our products, ordering,
            delivery, and more.
          </p>

          {/* Search Bar */}
          <div className="max-w-2xl mx-auto relative">
            <div className="relative">
              <Search className="absolute left-4 top-3.5 h-5 w-5 text-primary-foreground/70" />
              <input
                type="text"
                placeholder="Search your question..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-full border border-primary-foreground/20 focus:outline-none focus:ring-2 focus:ring-primary-foreground/30 focus:border-transparent bg-background/90 text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Categories */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="space-y-6">
            {filteredCategories.map((category) => (
              <div
                key={category.id}
                id={category.id}
                className="bg-card rounded-2xl shadow-sm overflow-hidden border border-border"
              >
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-accent transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                      <category.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-foreground">
                        {category.title}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {category.questions.length} questions
                      </p>
                    </div>
                  </div>
                  {openCategory === category.id ? (
                    <ChevronUp className="h-5 w-5 text-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-foreground" />
                  )}
                </button>

                {/* Category Questions */}
                {openCategory === category.id && (
                  <div className="border-t border-border">
                    {category.questions.map((item) => (
                      <div
                        key={item.id}
                        id={item.id}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <button
                          onClick={() => toggleItem(item.id)}
                          className="w-full p-6 text-left flex items-start justify-between hover:bg-accent transition-colors"
                        >
                          <div className="flex-1">
                            <h4 className="text-lg font-semibold text-foreground mb-2 text-left">
                              {item.question}
                            </h4>

                            {openItems.has(item.id) && (
                              <div className="mt-3">
                                <p className="text-muted-foreground leading-relaxed text-left">
                                  {item.answer}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="ml-4 flex-shrink-0">
                            {openItems.has(item.id) ? (
                              <ChevronUp className="h-5 w-5 text-primary" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-muted-foreground" />
                            )}
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* No Results Message */}
          {filteredCategories.length === 0 && (
            <div className="text-center py-12">
              <Search className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No results found
              </h3>
              <p className="text-muted-foreground mb-6">
                We couldn't find any questions matching your search.
              </p>
              <Button onClick={() => setSearchTerm("")} className="btn-primary">
                View all questions
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-16 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-8">Need more help?</h2>

          <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto">
            <Link
              href="/ecommerce/products"
              className="p-6 bg-background/10 rounded-lg hover:bg-background/20 transition-colors group"
            >
              <Package className="h-8 w-8 mx-auto mb-3 group-hover:scale-110 transition-transform" />
              <div className="font-semibold">All Products</div>
            </Link>

            <Link
              href="/ecommerce/contact"
              className="p-6 bg-background/10 rounded-lg hover:bg-background/20 transition-colors group"
            >
              <Mail className="h-8 w-8 mx-auto mb-3 group-hover:scale-110 transition-transform" />
              <div className="font-semibold">Contact</div>
            </Link>

            <Link
              href="/ecommerce/about"
              className="p-6 bg-background/10 rounded-lg hover:bg-background/20 transition-colors group"
            >
              <User className="h-8 w-8 mx-auto mb-3 group-hover:scale-110 transition-transform" />
              <div className="font-semibold">About Us</div>
            </Link>

            <Link
              href="/"
              className="p-6 bg-background/10 rounded-lg hover:bg-background/20 transition-colors group"
            >
              <Home className="h-8 w-8 mx-auto mb-3 group-hover:scale-110 transition-transform" />
              <div className="font-semibold">Homepage</div>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export default function FAQPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading FAQ...</p>
        </div>
      </div>
    }>
      <FAQPageContent />
    </Suspense>
  );
}
