import { Shield, Lock, Eye, User, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative py-16 bg-gradient-to-r from-primary to-primary/80">
        <div className="container mx-auto px-4 text-center">
          <div className="w-16 h-16 bg-background/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="h-8 w-8 text-primary-foreground" />
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            Privacy Policy
          </h1>
          <p className="text-lg text-primary-foreground/90">
            Your privacy is our priority
          </p>
        </div>
      </section>

      {/* Quick Overview */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="text-center p-6 bg-card rounded-xl shadow-sm border border-border">
              <Lock className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-2">
                Data Security
              </h3>
              <p className="text-sm text-muted-foreground">
                Your data is protected using SSL encryption
              </p>
            </div>

            <div className="text-center p-6 bg-card rounded-xl shadow-sm border border-border">
              <Eye className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-2">
                Transparency
              </h3>
              <p className="text-sm text-muted-foreground">
                We clearly explain what data we collect and why
              </p>
            </div>

            <div className="text-center p-6 bg-card rounded-xl shadow-sm border border-border">
              <User className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-2">Control</h3>
              <p className="text-sm text-muted-foreground">
                You can manage and control your information
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Data Collection */}
      <section className="py-12 bg-card">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-2xl font-bold text-foreground mb-8 text-center">
            What We Collect
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <User className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-foreground mb-2">
                    Personal Information
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Name and email address</li>
                    <li>• Phone number</li>
                    <li>• Delivery address</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <CreditCard className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-foreground mb-2">
                    Order Information
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Product preferences</li>
                    <li>• Order history</li>
                    <li>• Payment method (non-sensitive)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <Eye className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-foreground mb-2">
                    Usage Information
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Browsing activity</li>
                    <li>• Wishlist items</li>
                    <li>• Page views</li>
                  </ul>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <Shield className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-foreground mb-2">
                    What We Do Not Store
                  </h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Full bank details</li>
                    <li>• Full card numbers</li>
                    <li>• Plain-text passwords (stored securely/encrypted)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Data Usage */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-2xl font-bold text-foreground mb-8 text-center">
            How We Use Your Data
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-card rounded-xl p-6 border border-border">
              <h3 className="font-semibold mb-4 text-green-600 dark:text-green-400">
                Essential
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {[
                  "Order processing and delivery",
                  "Account management",
                  "Customer support",
                  "Product recommendations (based on activity)",
                ].map((t) => (
                  <li key={t} className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full mt-1.5 flex-shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-card rounded-xl p-6 border border-border">
              <h3 className="font-semibold mb-4 text-amber-600 dark:text-amber-400">
                With Your Permission
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {[
                  "Marketing emails",
                  "Special offers and promotions",
                  "New product notifications",
                  "Surveys and feedback requests",
                ].map((t) => (
                  <li key={t} className="flex items-start space-x-2">
                    <div className="w-2 h-2 bg-amber-600 dark:bg-amber-400 rounded-full mt-1.5 flex-shrink-0" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Your Rights */}
      <section className="py-12 bg-card">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-2xl font-bold text-foreground mb-8 text-center">
            Your Rights
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                icon: Eye,
                title: "Access Your Data",
                desc: "You can view and download the information we have about you.",
              },
              {
                icon: User,
                title: "Update Information",
                desc: "You can edit your profile details anytime.",
              }
            
            ].map((x) => (
              <div
                key={x.title}
                className="text-center p-6 bg-background rounded-xl border border-border"
              >
                <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto mb-3">
                  <x.icon className="h-6 w-6 text-primary-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">
                  {x.title}
                </h3>
                <p className="text-sm text-muted-foreground">{x.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact & Updates */}
      <section className="py-12 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <h2 className="text-2xl font-bold mb-4">Have Questions?</h2>
          <p className="mb-6 opacity-90">
            Contact us for any privacy-related inquiries.
          </p>

          <div className="flex justify-center">
            <Button asChild className="bg-background text-foreground hover:bg-background/90">
              <Link href="/ecommerce/contact">Contact our privacy team</Link>
            </Button>
          </div>

          <div className="mt-8 pt-6 border-t border-primary-foreground/20">
            <p className="text-sm opacity-80">
              <strong>Last Updated:</strong> January 2024
              <br />
              We may update this policy from time to time.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
