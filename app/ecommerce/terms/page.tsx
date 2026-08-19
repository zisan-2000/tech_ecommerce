import {
  FileText,
  Book,
  ShoppingCart,
  User,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative py-16 bg-gradient-to-r from-[#0E4B4B] to-[#086666]">
        <div className="container mx-auto px-4 text-center">
          <div className="w-16 h-16 bg-[#F4F8F7] bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="h-8 w-8 text-[#F4F8F7]" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-[#F4F8F7] mb-4">
            সেবার শর্তাবলী
          </h1>
          <p className="text-lg text-[#F4F8F7]/90">
            হিলফুল-ফুযুল প্রকাশনী ব্যবহারের নিয়ম ও শর্তাবলী
          </p>
        </div>
      </section>

      {/* Quick Overview */}
      <section className="bg-background py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="rounded-xl border border-border bg-card p-6 text-center text-card-foreground shadow-sm">
              <User className="mx-auto mb-3 h-8 w-8 text-primary" />
              <h3 className="mb-2 font-semibold text-foreground">অ্যাকাউন্ট</h3>
              <p className="text-sm text-muted-foreground">
                সঠিক তথ্য দিয়ে অ্যাকাউন্ট তৈরি করুন
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 text-center text-card-foreground shadow-sm">
              <ShoppingCart className="mx-auto mb-3 h-8 w-8 text-primary" />
              <h3 className="mb-2 font-semibold text-foreground">অর্ডার</h3>
              <p className="text-sm text-muted-foreground">
                অর্ডার দেওয়া মানেই শর্তাবলী মেনে নেওয়া
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 text-center text-card-foreground shadow-sm">
              <Shield className="mx-auto mb-3 h-8 w-8 text-primary" />
              <h3 className="mb-2 font-semibold text-foreground">দায়িত্ব</h3>
              <p className="text-sm text-muted-foreground">
                আপনার অ্যাকাউন্টের নিরাপত্তা আপনার দায়িত্ব
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main Terms */}
      <section className="border-y border-border bg-card py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="space-y-8">
            {/* Account Terms */}
            <div className="flex items-start space-x-4">
              <User className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="mb-3 text-xl font-bold text-foreground">
                  অ্যাকাউন্ট শর্তাবলী
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>আপনার বয়স 13 বছর হতে হবে</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>সঠিক এবং সম্পূর্ণ তথ্য প্রদান করতে হবে</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>আপনার অ্যাকাউন্টের নিরাপত্তা আপনার দায়িত্ব</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>
                      একটি মাত্র ব্যক্তি একটি অ্যাকাউন্ট ব্যবহার করতে পারবে
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Order Terms */}
            <div className="flex items-start space-x-4">
              <ShoppingCart className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="mb-3 text-xl font-bold text-foreground">
                  অর্ডার শর্তাবলী
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>অর্ডার confirm হওয়ার পর price পরিবর্তন হবে না</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>বই এর stock এবং availability পরিবর্তন হতে পারে</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>ভুল বই বা damage বই এর জন্য রিটার্ন applicable</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>
                      অর্ডার cancel করতে পারেন shipping শুরু হওয়ার আগে
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Payment Terms */}
            <div className="flex items-start space-x-4">
              <FileText className="mt-1 h-6 w-6 flex-shrink-0 text-primary" />
              <div>
                <h3 className="mb-3 text-xl font-bold text-foreground">
                  পেমেন্ট শর্তাবলী
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>সমস্ত মূল্য বাংলাদেশী টাকায় (৳) প্রদর্শিত</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>পেমেন্ট confirm হওয়ার পরই অর্ডার process হবে</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>ডেলিভারি চার্জ applicable (৫০০৳+ অর্ডারে ফ্রি)</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-[#0E4B4B] rounded-full mt-2 flex-shrink-0"></div>
                    <span>রিফান্ড original payment method এ processed</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Prohibited Activities */}
            <div className="flex items-start space-x-4">
              <AlertTriangle className="h-6 w-6 text-[#C0704D] mt-1 flex-shrink-0" />
              <div>
                <h3 className="mb-3 text-xl font-bold text-foreground">
                  নিষিদ্ধ কার্যক্রম
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-red-600 rounded-full mt-2 flex-shrink-0"></div>
                    <span>ভুয়া তথ্য প্রদান বা impersonation</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-red-600 rounded-full mt-2 flex-shrink-0"></div>
                    <span>অনুমতি ছাড়া অ্যাকাউন্ট ব্যবহার</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-red-600 rounded-full mt-2 flex-shrink-0"></div>
                    <span>বই এর পাইরেসি বা illegal distribution</span>
                  </li>
                  <li className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-red-600 rounded-full mt-2 flex-shrink-0"></div>
                    <span>সিস্টেমে disruption বা malicious activity</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Intellectual Property */}
      <section className="bg-background py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-8">
            <h2 className="mb-4 text-2xl font-bold text-foreground">
              মেধাস্বত্ব
            </h2>
            <div className="w-24 h-1 bg-[#C0704D] mx-auto"></div>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
            <div className="flex items-center space-x-3 mb-4">
              <Book className="h-6 w-6 text-primary" />
              <h3 className="text-lg font-semibold text-foreground">
                বই এবং কন্টেন্ট
              </h3>
            </div>
            <div className="space-y-3 text-muted-foreground">
              <p>
                সমস্ত বই এবং কন্টেন্ট সংশ্লিষ্ট লেখক এবং প্রকাশকের মেধাস্বত্ব
                দ্বারা সুরক্ষিত।
              </p>
              <p>
                কোনো বই এর unauthorized reproduction, distribution, বা digital
                copy তৈরি করা strictly prohibited.
              </p>
              <p>
                হিলফুল-ফুযুল প্রকাশনী শুধুমাত্র authorized retailer হিসেবে বই
                বিক্রি করে।
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Limitation of Liability */}
      <section className="border-y border-border bg-card py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-8">
            <h2 className="mb-4 text-2xl font-bold text-foreground">
              দায়িত্ব সীমাবদ্ধতা
            </h2>
            <div className="w-24 h-1 bg-[#C0704D] mx-auto"></div>
          </div>

          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-6">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="h-6 w-6 text-amber-600 mt-1 flex-shrink-0" />
              <div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">
                  গুরুত্বপূর্ণ নোটিশ
                </h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>
                    • আমরা delivery delays, carrier issues, বা force majeure
                    events এর জন্য দায়ী নই
                  </li>
                  <li>
                    • বই এর content, quality, বা accuracy সম্পর্কে আমাদের
                    liability limited
                  </li>
                  <li>
                    • আপনার অ্যাকাউন্ট security breach এর জন্য আমাদের liability
                    limited
                  </li>
                  <li>• সর্বোচ্চ liability হবে আপনার last order এর মূল্য</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact & Updates */}
      <section className="py-12 bg-gradient-to-r from-[#0E4B4B] to-[#086666] text-[#F4F8F7]">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <h2 className="text-2xl font-bold mb-4">
            শর্তাবলী সম্পর্কিত প্রশ্ন?
          </h2>
          <p className="mb-6 opacity-90">
            আমাদের টিম আপনার যেকোনো প্রশ্নের উত্তর দিতে প্রস্তুত
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              className="bg-[#F4F8F7] text-[#0E4B4B] hover:bg-[#F4F8F7]/90"
            >
              <Link href="/contact">যোগাযোগ করুন</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-[#F4F8F7] text-[#F4F8F7] hover:bg-[#F4F8F7] hover:text-[#0E4B4B]"
            >
              <Link href="/faq">সাধারণ জিজ্ঞাসা</Link>
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t border-[#F4F8F7] border-opacity-20">
            <p className="text-sm opacity-80">
              <strong>সর্বশেষ আপডেট:</strong> জানুয়ারি ২০২৪
              <br />
              আমরা আমাদের সেবার শর্তাবলী নিয়মিত আপডেট করি
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
