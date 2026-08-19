import {
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  Headphones,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ReturnsPolicyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Hero Section */}
      <section className="relative py-16 bg-gradient-to-r from-primary to-primary/80">
        <div className="container mx-auto px-4 text-center">
          <div className="w-16 h-16 bg-background/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="h-8 w-8 text-primary-foreground" />
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
            Returns Policy
          </h1>

          <p className="text-lg text-primary-foreground/90">
            Simple and transparent return process
          </p>
        </div>
      </section>

      {/* Quick Overview */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="text-center p-6 bg-card rounded-xl shadow-sm border border-border">
              <Clock className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-2">
                Within 7 Days
              </h3>
              <p className="text-sm text-muted-foreground">
                Returns must be requested within 7 days of delivery
              </p>
            </div>

            <div className="text-center p-6 bg-card rounded-xl shadow-sm border border-border">
              <Package className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-2">
                Unchanged Condition
              </h3>
              <p className="text-sm text-muted-foreground">
                Product must be unused and in original condition
              </p>
            </div>

            <div className="text-center p-6 bg-card rounded-xl shadow-sm border border-border">
              <RefreshCw className="h-8 w-8 text-primary mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-2">
                Fast Processing
              </h3>
              <p className="text-sm text-muted-foreground">
                Refund processed within 5–7 business days
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Policy Details */}
      <section className="py-12 bg-card">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="grid md:grid-cols-2 gap-8">
            {/* Eligible for Return */}
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center">
                <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 mr-3" />
                Eligible for Return
              </h2>

              <div className="space-y-4">
                {[
                  "Wrong product delivered",
                  "Manufacturing / printing defect",
                  "Product arrived damaged",
                  "Missing parts or accessories",
                ].map((t) => (
                  <div key={t} className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-green-600 dark:bg-green-400 rounded-full mt-2 flex-shrink-0" />
                    <p className="text-muted-foreground">{t}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Not Eligible for Return */}
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-6 flex items-center">
                <XCircle className="h-6 w-6 text-destructive mr-3" />
                Not Eligible for Return
              </h2>

              <div className="space-y-4">
                {[
                  "Used or damaged by customer",
                  "Scratches, marks, or modifications",
                  "Return request after 7 days",
                  "Original packaging missing or heavily damaged",
                ].map((t) => (
                  <div key={t} className="flex items-start space-x-3">
                    <div className="w-2 h-2 bg-destructive rounded-full mt-2 flex-shrink-0" />
                    <p className="text-muted-foreground">{t}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Process Steps */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4 max-w-4xl">
          <h2 className="text-2xl font-bold text-foreground mb-8 text-center">
            Return Process
          </h2>

          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                step: "1",
                title: "Contact Support",
                desc: "Reach out to our support team",
              },
              {
                step: "2",
                title: "Get Approval",
                desc: "Your return request will be reviewed",
              },
              {
                step: "3",
                title: "Send Product",
                desc: "Ship the product to our address",
              },
              {
                step: "4",
                title: "Receive Refund",
                desc: "Refund processed within 5–7 business days",
              },
            ].map((x) => (
              <div key={x.step} className="text-center">
                <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto mb-3 font-bold text-lg">
                  {x.step}
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

      {/* Refund Information */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-foreground mb-6">
            Refund Details
          </h2>

          <div className="bg-card rounded-xl p-6 border border-border">
            <div className="space-y-4 text-muted-foreground">
              <p>
                <strong className="text-foreground">Refund Time:</strong>{" "}
                5–7 business days
              </p>
              <p>
                <strong className="text-foreground">Refund Method:</strong>{" "}
                Original payment method
              </p>
              <p>
                <strong className="text-foreground">Shipping Charge:</strong>{" "}
                Non-refundable (except if it was our mistake)
              </p>
              <p>
                <strong className="text-foreground">Exchange:</strong> Same
                product or another product of equal value
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="py-12 bg-gradient-to-r from-primary to-primary/80 text-primary-foreground">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <h2 className="text-2xl font-bold mb-4">
            Need help with a return?
          </h2>
          <p className="mb-6 opacity-90">
            Our support team is ready to assist you.
          </p>

          <div className="flex justify-center">
            <Button asChild className="bg-background text-foreground hover:bg-background/90">
              <Link href="/ecommerce/contact">
                <Headphones className="h-4 w-4 mr-2" />
                Contact support
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
