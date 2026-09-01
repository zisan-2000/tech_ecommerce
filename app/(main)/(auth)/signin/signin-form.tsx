"use client";

import * as yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { signInSchema } from "@/validators/authValidators";
import { useForm } from "react-hook-form";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../../../components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormFieldset,
  FormItem,
  FormLabel,
  FormMessage,
} from "../../../../components/ui/form";
import { Input } from "../../../../components/ui/input";
import { Button } from "../../../../components/ui/button";

import { signIn, useSession } from "@/lib/auth-client";
import {
  getDashboardRoute,
  sanitizeReturnUrl,
  USER_DASHBOARD_ROUTE,
} from "@/lib/dashboard-route";
import { FormError } from "../../../../components/FormError";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";

type SignInValues = yup.InferType<typeof signInSchema>;

type SessionUserLike = Parameters<typeof getDashboardRoute>[0];

type BusinessContextPayload = {
  organizations?: Array<{
    organization?: {
      status?: string | null;
    } | null;
  }>;
};

const BUSINESS_PORTAL_STATUSES = new Set([
  "DRAFT",
  "PENDING_VERIFICATION",
  "ACTIVE",
]);

async function resolveBusinessAwareDefaultRoute(user: SessionUserLike) {
  const defaultRoute = getDashboardRoute(user);

  // Preserve dedicated admin, delivery, supplier and investor dashboards.
  // Only ordinary users are upgraded to the Business Portal when they have
  // an active organization membership.
  if (defaultRoute !== USER_DASHBOARD_ROUTE) {
    return defaultRoute;
  }

  try {
    const response = await fetch("/api/business/context", {
      cache: "no-store",
    });
    if (!response.ok) return defaultRoute;

    const payload = (await response.json().catch(() => null)) as
      | BusinessContextPayload
      | null;
    const organizations = Array.isArray(payload?.organizations)
      ? payload.organizations
      : [];

    const hasAccessibleBusinessMembership = organizations.some((membership) => {
      const status = membership?.organization?.status;
      return typeof status === "string" && BUSINESS_PORTAL_STATUSES.has(status);
    });

    return hasAccessibleBusinessMembership ? "/business" : defaultRoute;
  } catch {
    // Authentication should still succeed if business-context discovery is
    // temporarily unavailable; fall back to the ordinary user dashboard.
    return defaultRoute;
  }
}

const SigninForm = () => {
  const [formError, setFormError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const search = useSearchParams();
  const returnUrl = search.get("returnUrl") || search.get("callbackUrl");
  const { status } = useSession();

  const form = useForm<SignInValues>({
    resolver: yupResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: SignInValues) => {
    setFormError("");
    const dismiss = toast.loading("Signing you in...");
    try {
      const res = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });
      toast.dismiss(dismiss);
      if (res?.ok) {
        toast.success("Login successful");
        const sessionResponse = await fetch("/api/auth/session", {
          cache: "no-store",
        });
        const sessionData = sessionResponse.ok
          ? await sessionResponse.json().catch(() => null)
          : null;

        // Checkout continuity has the highest priority after authentication.
        const redirectAfterLogin = sessionStorage.getItem("redirectAfterLogin");
        const pendingCheckout = sessionStorage.getItem("pendingCheckout");

        if (redirectAfterLogin === "/ecommerce/checkout" && pendingCheckout) {
          try {
            const cartItems = JSON.parse(pendingCheckout);
            sessionStorage.removeItem("pendingCheckout");
            sessionStorage.removeItem("redirectAfterLogin");

            if (Array.isArray(cartItems) && cartItems.length > 0) {
              router.replace("/ecommerce/checkout");
              return;
            }

            const fallbackRoute = await resolveBusinessAwareDefaultRoute(
              sessionData?.user ?? null,
            );
            router.replace(fallbackRoute);
            return;
          } catch {
            sessionStorage.removeItem("pendingCheckout");
            sessionStorage.removeItem("redirectAfterLogin");
          }
        }

        // Explicit safe return URLs (for example a business invitation) must
        // win over any default dashboard routing.
        const safeReturnUrl = sanitizeReturnUrl(returnUrl);
        if (safeReturnUrl) {
          router.replace(safeReturnUrl);
          return;
        }

        const nextRoute = await resolveBusinessAwareDefaultRoute(
          sessionData?.user ?? null,
        );
        router.replace(nextRoute);
        return;
      }
      const message =
        res?.error ||
        "Invalid credentials. Please check your email and password.";
      setFormError(message);
      toast.error(message);
    } catch (err: unknown) {
      toast.dismiss(dismiss);
      const message =
        (err instanceof Error ? err.message : String(err)) ||
        "Something went wrong while signing in.";
      setFormError(message);
      toast.error(message);
    }
  };

  return (
    <Card className="border border-border bg-card text-card-foreground shadow-md max-w-md mx-auto">
      <div className="h-1 w-full bg-gradient-to-r from-primary via-ring to-destructive rounded-t-xl" />

      <CardHeader className="items-center pb-4 pt-6">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-foreground">
          <Lock className="h-6 w-6" />
        </div>
        <CardTitle className="text-2xl font-semibold text-foreground">
          Log In
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground text-center">
          Enter your account details to access your dashboard
        </CardDescription>
      </CardHeader>

      <CardContent className="pt-0 pb-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormFieldset className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-foreground">
                      Email
                    </FormLabel>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="Enter email address"
                          autoComplete="email"
                          className="input-theme pr-10"
                          {...field}
                        />
                      </FormControl>
                      <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    </div>
                    <FormMessage className="text-xs text-red-500" />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-sm font-medium text-foreground">
                        Password
                      </FormLabel>
                      <Link
                        href="/forgot-password"
                        className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <FormControl>
                        <Input
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter password"
                          autoComplete="current-password"
                          className="input-theme pr-10"
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-5 w-5" />
                        ) : (
                          <Eye className="h-5 w-5" />
                        )}
                      </button>
                    </div>
                    <FormMessage className="text-xs text-red-500" />
                  </FormItem>
                )}
              />
            </FormFieldset>

            <FormError message={formError} />

            <Button
              type="submit"
              className="mt-2 w-full rounded-lg btn-primary text-sm font-medium py-2.5 shadow-sm hover:shadow-md transition-all duration-200"
              disabled={status === "loading" || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Signing in..." : "Sign In"}
            </Button>
          </form>
        </Form>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="mt-3 text-center text-sm">
          <span className="text-muted-foreground">
            Don&apos;t have an account?{" "}
          </span>
          <Link
            href="/sign-up"
            className="font-medium text-foreground hover:underline"
          >
            Create an account
          </Link>
        </div>
      </CardContent>
    </Card>
  );
};

export default SigninForm;
