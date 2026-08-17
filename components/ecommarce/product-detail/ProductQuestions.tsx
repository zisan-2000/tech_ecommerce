"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Loader2, MessageCircleQuestion } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-client";

type ProductQuestion = {
  id: number;
  question: string;
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
  user: { name: string | null };
  answeredBy: { name: string | null } | null;
};

export default function ProductQuestions({ productId }: { productId: number }) {
  const router = useRouter();
  const { data: session, status } = useSession();
  const role = String((session?.user as { role?: string } | undefined)?.role || "user").toLowerCase();
  const mayAnswer = status === "authenticated" && role !== "user";
  const [questions, setQuestions] = useState<ProductQuestion[]>([]);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [answeringId, setAnsweringId] = useState<number | null>(null);

  const loadQuestions = useCallback(async (fresh = false) => {
    try {
      setLoading(true);
      const suffix = fresh ? `&fresh=${Date.now()}` : "";
      const response = await fetch(`/api/product-questions?productId=${productId}${suffix}`);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Questions could not be loaded.");
      setQuestions(Array.isArray(data?.questions) ? data.questions : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Questions could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const askQuestion = async () => {
    if (status !== "authenticated") {
      router.push(`/signin?callbackUrl=${encodeURIComponent(`/ecommerce/products/${productId}`)}`);
      return;
    }
    const value = question.trim();
    if (value.length < 5) {
      toast.error("Please enter a complete question.");
      return;
    }
    try {
      setSubmitting(true);
      const response = await fetch("/api/product-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, question: value }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Question could not be submitted.");
      setQuestion("");
      toast.success("Your question was submitted.");
      await loadQuestions(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Question could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  };

  const answerQuestion = async (id: number) => {
    const answer = answers[id]?.trim() || "";
    if (answer.length < 2) return;
    try {
      setAnsweringId(id);
      const response = await fetch("/api/product-questions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, answer }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Answer could not be saved.");
      setAnswers((current) => ({ ...current, [id]: "" }));
      toast.success("Answer published.");
      await loadQuestions(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Answer could not be saved.");
    } finally {
      setAnsweringId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <MessageCircleQuestion className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-xl font-black">Questions & answers</h2>
          <p className="text-xs text-muted-foreground">Ask about compatibility, specifications or purchasing.</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-background p-4">
        <label htmlFor="product-question" className="text-sm font-bold">Ask a question</label>
        <textarea
          id="product-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value.slice(0, 500))}
          placeholder="What would you like to know about this product?"
          className="mt-2 min-h-24 w-full rounded-xl border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{question.length}/500</span>
          <button
            type="button"
            onClick={askQuestion}
            disabled={submitting || question.trim().length < 5}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <HelpCircle className="h-4 w-4" />}
            {status === "authenticated" ? "Submit question" : "Sign in to ask"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border p-5 text-sm text-muted-foreground">Loading questions...</div>
      ) : questions.length === 0 ? (
        <div className="rounded-xl border p-5 text-sm text-muted-foreground">No questions yet. Be the first to ask.</div>
      ) : (
        <div className="divide-y overflow-hidden rounded-2xl border bg-background">
          {questions.map((item) => (
            <article key={item.id} className="p-4 sm:p-5">
              <div className="flex gap-3">
                <span className="font-black text-primary">Q</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.question}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.user?.name || "Customer"} · {new Date(item.createdAt).toLocaleDateString("en-BD")}
                  </p>
                </div>
              </div>
              {item.answer ? (
                <div className="ml-7 mt-3 rounded-xl bg-primary/5 p-3 text-sm leading-6">
                  <strong className="mr-2 text-primary">A</strong>{item.answer}
                  <p className="mt-1 text-[11px] text-muted-foreground">Answered by {item.answeredBy?.name || "Store team"}</p>
                </div>
              ) : (
                <p className="ml-7 mt-2 text-xs text-muted-foreground">Awaiting an answer from the store team.</p>
              )}
              {mayAnswer ? (
                <div className="ml-7 mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={answers[item.id] || ""}
                    onChange={(event) => setAnswers((current) => ({ ...current, [item.id]: event.target.value.slice(0, 2_000) }))}
                    placeholder={item.answer ? "Update the published answer" : "Write an official answer"}
                    className="h-10 flex-1 rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  <button
                    type="button"
                    onClick={() => answerQuestion(item.id)}
                    disabled={answeringId === item.id || (answers[item.id]?.trim().length || 0) < 2}
                    className="h-10 rounded-lg border px-4 text-sm font-bold hover:border-primary disabled:opacity-50"
                  >
                    {answeringId === item.id ? "Saving..." : "Publish answer"}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
