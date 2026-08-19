"use client";
import { useState } from "react";
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Send,
  MessageCircle,
  User,
  BookOpen,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");
    setErrorMessage("");

    try {
      // Validate form data
      if (
        !formData.name ||
        !formData.email ||
        !formData.subject ||
        !formData.message
      ) {
        throw new Error("অনুগ্রহ করে সকল ঘর পূরণ করুন");
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(formData.email)) {
        throw new Error("অনুগ্রহ করে একটি সঠিক ইমেইল ঠিকানা দিন");
      }

      // Create email content
      const emailContent = {
        to: "islamidawainstitute@gmail.com, service@birdsofeden.me",
        subject: `নতুন যোগাযোগ মেসেজ: ${formData.subject}`,
        body: `
নাম: ${formData.name}
ইমেইল: ${formData.email}
বিষয়: ${formData.subject}

মেসেজ:
${formData.message}

---
এই মেসেজটি হিলফুল-ফুযুল বইয়ের দোকান ওয়েবসাইট থেকে পাঠানো হয়েছে।
সময়: ${new Date().toLocaleString("bn-BD", { timeZone: "Asia/Dhaka" })}
        `,
        replyTo: formData.email,
      };

      // Send email via API
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'মেসেজ পাঠাতে সমস্যা হয়েছে, অনুগ্রহ করে আবার চেষ্টা করুন');
      }
      
      // Show success message
      setSubmitStatus("success");
      
      // Reset form
      setFormData({
        name: "",
        email: "",
        subject: "",
        message: "",
      });
    } catch (error) {
      console.error("Form submission error:", error);
      setSubmitStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "মেসেজ পাঠাতে সমস্যা হয়েছে, অনুগ্রহ করে আবার চেষ্টা করুন"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative py-20 bg-gradient-to-r from-[#0E4B4B] to-[#086666]">
        <div className="container mx-auto px-4 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-[#F4F8F7] mb-4">
            আমাদের সাথে যোগাযোগ করুন
          </h1>
          <p className="text-xl text-[#F4F8F7]/90 max-w-2xl mx-auto">
            আপনার যেকোনো প্রশ্ন, মতামত বা সহায়তার জন্য আমরা এখানে আছি
          </p>
        </div>
      </section>

      {/* Contact Information */}
      <section className="bg-background py-16">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="mb-4 text-3xl font-bold text-foreground md:text-4xl">
              আমরা আপনার কথাগুলো শুনতে চাই
            </h2>
            <div className="w-24 h-1 bg-[#C0704D] mx-auto mb-4"></div>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
              বই, অর্ডার, বা সাধারণ যেকোনো প্রশ্নে আমরা সাহায্য করতে প্রস্তুত
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            <div className="rounded-lg border border-border bg-card p-6 text-center text-card-foreground shadow-sm transition-shadow hover:shadow-md">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <MapPin className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-foreground">
                আমাদের ঠিকানা
              </h3>
              <p className="text-muted-foreground">গ্রীন রোড, ঢাকা-১২১৫ বাংলাদেশ</p>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 text-center text-card-foreground shadow-sm transition-shadow hover:shadow-md">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Phone className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-foreground">
                ফোন করুন
              </h3>
              <p className="text-muted-foreground">
                +88-01842781978
                <br />
                সকাল ৯টা - রাত ১০টা
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 text-center text-card-foreground shadow-sm transition-shadow hover:shadow-md">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-foreground">
                ইমেইল করুন
              </h3>
              <p className="break-words text-muted-foreground">
                islamidawainstitute@gmail.com
              </p>
            </div>

            <div className="rounded-lg border border-border bg-card p-6 text-center text-card-foreground shadow-sm transition-shadow hover:shadow-md">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Clock className="h-8 w-8 text-primary" />
              </div>
              <h3 className="mb-3 text-xl font-semibold text-foreground">
                কাজের সময়
              </h3>
              <p className="text-muted-foreground">২৪/৭ অনলাইন অর্ডার</p>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <div className="rounded-2xl border border-border bg-card p-8 text-card-foreground shadow-sm">
              <div className="flex items-center mb-6">
                <MessageCircle className="h-6 w-6 text-[#C0704D] mr-3" />
                <h3 className="text-2xl font-bold text-foreground">
                  মেসেজ পাঠান
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="name"
                      className="block text-sm font-medium text-foreground"
                    >
                      আপনার নাম *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-[#5FA3A3]" />
                      <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="আপনার পুরো নাম"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-foreground"
                    >
                      ইমেইল ঠিকানা *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-[#5FA3A3]" />
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="subject"
                    className="block text-sm font-medium text-foreground"
                  >
                    বিষয় *
                  </label>
                  <div className="relative">
                    <BookOpen className="absolute left-3 top-3 h-4 w-4 text-[#5FA3A3]" />
                    <input
                      type="text"
                      id="subject"
                      name="subject"
                      required
                      value={formData.subject}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="মেসেজের বিষয়"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="message"
                    className="block text-sm font-medium text-foreground"
                  >
                    আপনার মেসেজ *
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={6}
                    value={formData.message}
                    onChange={handleChange}
                    className="w-full resize-none rounded-lg border border-input bg-background px-4 py-2 text-foreground placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="আপনার মেসেজটি এখানে লিখুন..."
                  />
                </div>

                {/* Status Messages */}
                {submitStatus === "success" && (
                  <div className="flex items-center space-x-3 rounded-lg border border-emerald-500/25 bg-emerald-500/10 p-4">
                    <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="font-semibold text-emerald-800 dark:text-emerald-300">
                        মেসেজ সফলভাবে পাঠানো হয়েছে!
                      </p>
                      <p className="text-sm text-emerald-700 dark:text-emerald-400">
                        আমরা শীঘ্রই আপনার সাথে যোগাযোগ করব।
                      </p>
                    </div>
                  </div>
                )}

                {submitStatus === "error" && (
                  <div className="flex items-center space-x-3 rounded-lg border border-destructive/25 bg-destructive/10 p-4">
                    <AlertCircle className="h-5 w-5 flex-shrink-0 text-destructive" />
                    <div>
                      <p className="font-semibold text-destructive">
                        মেসেজ পাঠাতে সমস্যা হয়েছে
                      </p>
                      <p className="text-sm text-destructive/90">{errorMessage}</p>
                    </div>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#C0704D] hover:bg-[#A85D3F] text-[#F4F8F7] font-semibold py-3 rounded-lg transition-all duration-300 hover:shadow-lg hover:scale-105 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>পাঠানো হচ্ছে...</span>
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      <span>মেসেজ পাঠান</span>
                    </>
                  )}
                </Button>
              </form>
            </div>

            {/* FAQ & Additional Info */}
            <div className="space-y-8">
              <div className="rounded-2xl border border-border bg-card p-8 text-card-foreground shadow-sm">
                <h3 className="mb-6 text-2xl font-bold text-foreground">
                  দ্রুত জরুরী তথ্য
                </h3>

                <div className="space-y-4">
                  <div className="rounded-lg border-l-4 border-[#C0704D] bg-muted/60 p-4">
                    <h4 className="mb-2 font-semibold text-foreground">
                      অর্ডার সম্পর্কিত প্রশ্ন
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      আপনার অর্ডার স্ট্যাটাস, পরিবর্তন বা বাতিল সম্পর্কে জানতে
                      আমাদের কল করুন বা ইমেইল করুন।
                    </p>
                  </div>

                  <div className="rounded-lg border-l-4 border-primary bg-muted/60 p-4">
                    <h4 className="mb-2 font-semibold text-foreground">
                      বইয়ের প্রাপ্যতা
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      নির্দিষ্ট বই পাওয়া যাচ্ছে কিনা জানতে সরাসরি ফোনে যোগাযোগ
                      করুন দ্রুত জানার জন্য।
                    </p>
                  </div>

                  <div className="rounded-lg border-l-4 border-primary/60 bg-muted/60 p-4">
                    <h4 className="mb-2 font-semibold text-foreground">
                      লেখক হওয়ার জন্য
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      আপনার বই প্রকাশ করতে চাইলে islamidawainstitute@gmail.com এ
                      মেইল করুন।
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-to-r from-[#0E4B4B] to-[#086666] text-[#F4F8F7]">
        <div className="container mx-auto px-4 text-center max-w-4xl">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            এখনই বইয়ের জগতে ডুব দিন
          </h2>
          <p className="text-xl mb-8 opacity-90">
            আপনার পরবর্তী প্রিয় বইটি খুঁজে নিন হিলফুল-ফুযুল প্রকাশনীর বিশাল
            সংগ্রহ থেকে
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              asChild
              className="bg-[#F4F8F7] text-[#0E4B4B] px-8 py-3 rounded-lg font-semibold hover:bg-[#F4F8F7]/90 transition-all duration-300 hover:scale-105"
            >
              <a href="/ecommerce/books">সকল বই দেখুন</a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="bg-[#F4F8F7] text-[#0E4B4B] px-8 py-3 rounded-lg font-semibold hover:bg-[#F4F8F7]/90 transition-all duration-300 hover:scale-105"
            >
              <a href="tel:+88-01842781978">এখনই কল করুন</a>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
