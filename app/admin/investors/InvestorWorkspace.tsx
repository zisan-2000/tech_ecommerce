"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvestorTable } from "@/components/investors/InvestorTable";
import {
  InvestorWorkflowGuide,
  type InvestorWorkflowSection,
} from "@/components/investors/InvestorWorkflowGuide";
import { exportInvestorStatementPdf } from "@/lib/export-investor-statement-pdf";

type Investor = {
  id: number;
  code: string;
  name: string;
  status: string;
  kycStatus: string;
  totals: {
    credit: number;
    debit: number;
    balance: number;
  };
};

type Variant = {
  id: number;
  sku: string;
  product: { name: string };
};

type Transaction = {
  id: number;
  transactionNumber: string;
  transactionDate: string;
  type: string;
  direction: string;
  amount: string;
  currency: string;
  investor: {
    id: number;
    code: string;
    name: string;
  };
  productVariant: Variant | null;
};

type Allocation = {
  id: number;
  investor: { id: number; code: string; name: string };
  productVariant: Variant;
  participationPercent: string | null;
  committedAmount: string | null;
  status: string;
};

type TxPayload = {
  variants: Variant[];
  transactions: Transaction[];
};

type ProfitRun = {
  id: number;
  runNumber: string;
  fromDate: string;
  toDate: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "POSTED";
  allocationBasis: "NET_REVENUE" | "NET_UNITS";
  marketingExpense: string;
  adsExpense: string;
  logisticsExpense: string;
  otherExpense: string;
  totalOperatingExpense: string;
  totalNetRevenue: string;
  totalNetCogs: string;
  totalNetProfit: string;
  approvedAt: string | null;
  postedAt: string | null;
  createdAt: string;
  _count?: {
    variantLines: number;
    allocationLines: number;
    payouts: number;
  };
};

type ProfitVariantLine = {
  id: number;
  productVariant: Variant;
  unitsSold: number;
  unitsRefunded: number;
  unitsNet: number;
  netRevenue: string;
  netCogs: string;
  allocatedExpense: string;
  netProfit: string;
  unallocatedSharePct: string;
};

type ProfitAllocationLine = {
  id: number;
  investor: {
    id: number;
    code: string;
    name: string;
  };
  productVariant: Variant;
  participationSharePct: string;
  allocatedRevenue: string;
  allocatedNetProfit: string;
};

type ProfitPayout = {
  id: number;
  payoutNumber: string;
  investor: {
    id: number;
    code: string;
    name: string;
  };
  payoutPercent: string;
  holdbackPercent: string;
  grossProfitAmount: string;
  holdbackAmount: string;
  payoutAmount: string;
  currency: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "PAID" | "VOID";
  approvalNote?: string | null;
  rejectionReason?: string | null;
  paymentMethod?: "BANK_TRANSFER" | "MOBILE_BANKING" | "CHEQUE" | "CASH" | null;
  bankReference?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  paidAt: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  voidReversalReference?: string | null;
  transaction: {
    id: number;
    transactionNumber: string;
    transactionDate: string;
    type: string;
    direction: string;
    amount: string;
  } | null;
};

type PayoutRegisterItem = ProfitPayout & {
  heldAt?: string | null;
  releasedAt?: string | null;
  run: {
    id: number;
    runNumber: string;
    status: string;
    fromDate: string;
    toDate: string;
  };
  investor: ProfitPayout["investor"] & {
    beneficiaryVerifiedAt?: string | null;
  };
};

type StatementSummary = {
  investorCount: number;
  transactionCount: number;
  payoutCount: number;
  totalCredit: string;
  totalDebit: string;
  totalNet: string;
};

type StatementInvestorTransaction = {
  id: number;
  investorId: number;
  transactionNumber: string;
  direction: string;
  type: string;
  amount: string;
  currency: string;
  transactionDate: string;
};

type StatementInvestorPayout = {
  id: number;
  investorId: number;
  payoutNumber: string;
  status: string;
  payoutAmount: string;
  currency: string;
  paidAt: string | null;
  createdAt: string;
  paymentMethod: string | null;
  bankReference: string | null;
};

type StatementRow = {
  investor: {
    id: number;
    code: string;
    name: string;
    status: string;
  };
  totals: {
    credit: string;
    debit: string;
    net: string;
  };
  counts: {
    transactionCount: number;
    payoutCount: number;
  };
  transactions: StatementInvestorTransaction[];
  payouts: StatementInvestorPayout[];
};

type StatementPayload = {
  summary: StatementSummary;
  from: string;
  to: string;
  statements: StatementRow[];
};

type ProfitPayload = {
  runs: ProfitRun[];
  selectedRunId: number | null;
  variantLines: ProfitVariantLine[];
  allocationLines: ProfitAllocationLine[];
  payouts: ProfitPayout[];
};

const TRANSACTION_TYPES = [
  "CAPITAL_COMMITMENT",
  "CAPITAL_CONTRIBUTION",
  "PROFIT_ALLOCATION",
  "LOSS_ALLOCATION",
  "DISTRIBUTION",
  "WITHDRAWAL",
  "ADJUSTMENT",
] as const;

export type InvestorSection =
  | "overview"
  | "registry"
  | "ledger"
  | "allocations"
  | "profit-runs"
  | "payouts"
  | "statements";

async function readJson<T>(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error || fallback);
  }
  return payload as T;
}

function toInputDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function formatMoney(value: string | number, currency = "BDT") {
  const amount = typeof value === "number" ? value : Number(value || 0);
  if (Number.isNaN(amount)) return `0.00 ${currency}`;
  return `${amount.toFixed(2)} ${currency}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString();
}

export default function InvestorWorkspace({
  section = "overview",
}: {
  section?: InvestorSection;
}) {
  const searchParams = useSearchParams();
  const defaultStatementFrom = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return toInputDate(date);
  }, []);
  const defaultStatementTo = useMemo(() => toInputDate(new Date()), []);
  const { data: session } = useSession();
  const globalPermissions = Array.isArray(
    (session?.user as any)?.globalPermissions,
  )
    ? ((session?.user as any).globalPermissions as string[])
    : [];

  const canManageInvestors = globalPermissions.includes("investors.manage");
  const canManageLedger = globalPermissions.includes("investor_ledger.manage");
  const canManageAllocations = globalPermissions.includes(
    "investor_allocations.manage",
  );
  const canReadProfit =
    globalPermissions.includes("investor_profit.read") ||
    globalPermissions.includes("investor_profit.manage") ||
    globalPermissions.includes("investor_profit.approve") ||
    globalPermissions.includes("investor_profit.post") ||
    globalPermissions.includes("investor_payout.read") ||
    globalPermissions.includes("investor_payout.manage") ||
    globalPermissions.includes("investor_payout.approve") ||
    globalPermissions.includes("investor_payout.pay") ||
    globalPermissions.includes("investor_payout.void") ||
    globalPermissions.includes("investor_statement.read");
  const canManageProfit = globalPermissions.includes("investor_profit.manage");
  const canApproveProfit = globalPermissions.includes(
    "investor_profit.approve",
  );
  const canPostProfit = globalPermissions.includes("investor_profit.post");
  const canReadPayout =
    globalPermissions.includes("investor_payout.read") ||
    globalPermissions.includes("investor_payout.manage") ||
    globalPermissions.includes("investor_payout.approve") ||
    globalPermissions.includes("investor_payout.pay") ||
    globalPermissions.includes("investor_payout.void") ||
    globalPermissions.includes("investor_statement.read");
  const canManagePayout = globalPermissions.includes("investor_payout.manage");
  const canApprovePayout = globalPermissions.includes(
    "investor_payout.approve",
  );
  const canPayPayout = globalPermissions.includes("investor_payout.pay");
  const canVoidPayout = globalPermissions.includes("investor_payout.void");
  const canReadStatement = globalPermissions.includes(
    "investor_statement.read",
  );
  const canReadInvestors =
    globalPermissions.includes("investors.read") || canManageInvestors;
  const canReadLedger =
    globalPermissions.includes("investor_ledger.read") || canManageLedger;
  const canReadAllocations =
    globalPermissions.includes("investor_allocations.read") ||
    canManageAllocations;
  const isOverview = section === "overview";
  const showSection = (target: Exclude<InvestorSection, "overview">) =>
    isOverview || section === target;
  const sectionTitleMap: Record<InvestorSection, string> = {
    overview: "Overview",
    registry: "Registry & KYC",
    ledger: "Capital Ledger",
    allocations: "Allocations",
    "profit-runs": "Profit Runs",
    payouts: "Payouts",
    statements: "Statements",
  };
  const canAccessSelectedSection =
    section === "overview"
      ? canReadInvestors ||
        canReadLedger ||
        canReadAllocations ||
        canReadProfit ||
        canReadPayout ||
        canReadStatement
      : section === "registry"
        ? canReadInvestors
        : section === "ledger"
          ? canReadLedger
          : section === "allocations"
            ? canReadAllocations
            : section === "profit-runs"
              ? canReadProfit
              : section === "payouts"
                ? canReadPayout
                : canReadStatement;

  const [loading, setLoading] = useState(true);
  const [investors, setInvestors] = useState<Investor[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [selectedInvestorId, setSelectedInvestorId] = useState("");
  const [profitRuns, setProfitRuns] = useState<ProfitRun[]>([]);
  const [selectedProfitRunId, setSelectedProfitRunId] = useState("");
  const [payoutRunFilter, setPayoutRunFilter] = useState("");
  const [profitStatusFilter, setProfitStatusFilter] = useState("");
  const [payoutStatusFilter, setPayoutStatusFilter] = useState("");
  const [statementFrom, setStatementFrom] = useState(defaultStatementFrom);
  const [statementTo, setStatementTo] = useState(defaultStatementTo);
  const [profitVariantLines, setProfitVariantLines] = useState<
    ProfitVariantLine[]
  >([]);
  const [profitAllocationLines, setProfitAllocationLines] = useState<
    ProfitAllocationLine[]
  >([]);
  const [profitPayouts, setProfitPayouts] = useState<ProfitPayout[]>([]);
  const [payoutRegister, setPayoutRegister] = useState<PayoutRegisterItem[]>(
    [],
  );
  const [statementSummary, setStatementSummary] = useState<StatementSummary>({
    investorCount: 0,
    transactionCount: 0,
    payoutCount: 0,
    totalCredit: "0",
    totalDebit: "0",
    totalNet: "0",
  });
  const [statementRows, setStatementRows] = useState<StatementRow[]>([]);
  const [statementDetailInvestorId, setStatementDetailInvestorId] = useState("");
  const [loadingStatementPreview, setLoadingStatementPreview] = useState(false);
  const [runningProfit, setRunningProfit] = useState(false);
  const [updatingRunStatus, setUpdatingRunStatus] = useState(false);
  const [postingRun, setPostingRun] = useState(false);
  const [processingPayout, setProcessingPayout] = useState(false);
  const [actingPayoutId, setActingPayoutId] = useState<number | null>(null);
  const [exportingStatement, setExportingStatement] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    const investorId = searchParams.get("investorId") || "";
    const runIdParam = searchParams.get("runId");
    const status = searchParams.get("status") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    if (investorId !== selectedInvestorId) {
      setSelectedInvestorId(investorId);
    }
    if (
      (section === "profit-runs" || section === "payouts") &&
      runIdParam !== null &&
      runIdParam !== selectedProfitRunId
    ) {
      setSelectedProfitRunId(runIdParam);
    }
    if (
      section === "payouts" &&
      runIdParam !== null &&
      runIdParam !== payoutRunFilter
    ) {
      setPayoutRunFilter(runIdParam);
    }
    if (section === "profit-runs" && status !== profitStatusFilter) {
      setProfitStatusFilter(status);
    }
    if (section === "payouts" && status !== payoutStatusFilter) {
      setPayoutStatusFilter(status);
    }
    if (from && from !== statementFrom) {
      setStatementFrom(from);
    }
    if (to && to !== statementTo) {
      setStatementTo(to);
    }
  }, [
    payoutStatusFilter,
    payoutRunFilter,
    profitStatusFilter,
    searchParams,
    section,
    selectedInvestorId,
    selectedProfitRunId,
    statementFrom,
    statementTo,
  ]);

  const [investorName, setInvestorName] = useState("");
  const [investorEmail, setInvestorEmail] = useState("");
  const [investorPhone, setInvestorPhone] = useState("");
  const [investorLegalName, setInvestorLegalName] = useState("");
  const [investorTaxNumber, setInvestorTaxNumber] = useState("");
  const [investorNationalIdNumber, setInvestorNationalIdNumber] = useState("");
  const [investorPassportNumber, setInvestorPassportNumber] = useState("");
  const [investorBankName, setInvestorBankName] = useState("");
  const [investorBankAccountName, setInvestorBankAccountName] = useState("");
  const [investorBankAccountNumber, setInvestorBankAccountNumber] =
    useState("");
  const [investorNotes, setInvestorNotes] = useState("");
  const [transactionForm, setTransactionForm] = useState({
    investorId: "",
    type: "CAPITAL_CONTRIBUTION" as (typeof TRANSACTION_TYPES)[number],
    direction: "CREDIT" as "DEBIT" | "CREDIT",
    amount: "",
    currency: "BDT",
    productVariantId: "",
  });
  const [allocationForm, setAllocationForm] = useState({
    investorId: "",
    productVariantId: "",
    participationPercent: "",
    committedAmount: "",
  });
  const [profitRunForm, setProfitRunForm] = useState({
    fromDate: "",
    toDate: "",
    allocationBasis: "NET_REVENUE" as "NET_REVENUE" | "NET_UNITS",
    marketingExpense: "",
    adsExpense: "",
    logisticsExpense: "",
    otherExpense: "",
    note: "",
  });
  const [runActionNote, setRunActionNote] = useState("");
  const [payoutForm, setPayoutForm] = useState({
    payoutPercent: "100",
    holdbackPercent: "0",
    currency: "BDT",
    note: "",
  });
  const [payoutActionForm, setPayoutActionForm] = useState({
    note: "",
    paymentMethod: "BANK_TRANSFER" as
      | "BANK_TRANSFER"
      | "MOBILE_BANKING"
      | "CHEQUE"
      | "CASH",
    bankReference: "",
    paidAt: "",
    voidReason: "",
  });

  const loadData = async () => {
    try {
      if (!hasLoadedOnce) {
        setLoading(true);
      }
      const investorParam = selectedInvestorId
        ? `?investorId=${selectedInvestorId}`
        : "";
      const profitParams = new URLSearchParams();
      if (selectedInvestorId) {
        profitParams.set("investorId", selectedInvestorId);
      }
      if (selectedProfitRunId) {
        profitParams.set("runId", selectedProfitRunId);
      }
      const profitUrl = `/api/admin/investor-profit-runs${profitParams.size > 0 ? `?${profitParams.toString()}` : ""}`;
      const payoutParams = new URLSearchParams();
      if (selectedInvestorId) {
        payoutParams.set("investorId", selectedInvestorId);
      }
      if (payoutRunFilter) {
        payoutParams.set("runId", payoutRunFilter);
      }
      if (payoutStatusFilter) {
        payoutParams.set("status", payoutStatusFilter);
      }
      const payoutUrl = `/api/admin/investor-payouts${payoutParams.size > 0 ? `?${payoutParams.toString()}` : ""}`;

      const [investorRes, txRes, allocationRes, payoutRes] = await Promise.all([
        fetch("/api/admin/investors", { cache: "no-store" }),
        fetch(`/api/admin/investor-transactions${investorParam}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/investor-allocations${investorParam}`, {
          cache: "no-store",
        }),
        fetch(payoutUrl, { cache: "no-store" }),
      ]);

      const investorData = await readJson<Investor[]>(
        investorRes,
        "Failed to load investors",
      );
      const txData = await readJson<TxPayload>(
        txRes,
        "Failed to load transactions",
      );
      const allocationData = await readJson<Allocation[]>(
        allocationRes,
        "Failed to load allocations",
      );
      const payoutData = await readJson<{ payouts: PayoutRegisterItem[] }>(
        payoutRes,
        "Failed to load investor payouts",
      );
      let profitData: ProfitPayload = {
        runs: [],
        selectedRunId: null,
        variantLines: [],
        allocationLines: [],
        payouts: [],
      };
      if (canReadProfit) {
        const profitRes = await fetch(profitUrl, { cache: "no-store" });
        profitData = await readJson<ProfitPayload>(
          profitRes,
          "Failed to load investor profit runs",
        );
      }

      const processedInvestors = investorData.map(investor => ({
        ...investor,
        totals: {
          credit: Number(investor.totals.credit),
          debit: Number(investor.totals.debit),
          balance: Number(investor.totals.balance),
        },
      }));
      setInvestors(processedInvestors);
      setVariants(txData.variants || []);
      setTransactions(txData.transactions || []);
      setAllocations(allocationData || []);
      setProfitRuns(profitData.runs || []);
      setProfitVariantLines(profitData.variantLines || []);
      setProfitAllocationLines(profitData.allocationLines || []);
      setProfitPayouts(profitData.payouts || []);
      setPayoutRegister(payoutData.payouts || []);
      const apiRunId =
        profitData.selectedRunId && Number.isInteger(profitData.selectedRunId)
          ? String(profitData.selectedRunId)
          : "";
      if (apiRunId !== selectedProfitRunId) {
        setSelectedProfitRunId(apiRunId);
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to load investor workspace");
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
    }
  };

  useEffect(() => {
    void loadData();
  }, [
    canReadProfit,
    payoutRunFilter,
    payoutStatusFilter,
    selectedInvestorId,
    selectedProfitRunId,
  ]);

  useEffect(() => {
    if (!selectedInvestorId) return;
    setTransactionForm((current) => ({
      ...current,
      investorId: selectedInvestorId,
    }));
    setAllocationForm((current) => ({
      ...current,
      investorId: selectedInvestorId,
    }));
  }, [selectedInvestorId]);

  const loadStatementPreview = useCallback(async () => {
    if (!canReadStatement) return;
    try {
      setLoadingStatementPreview(true);
      const params = new URLSearchParams();
      if (selectedInvestorId) {
        params.set("investorId", selectedInvestorId);
      }
      params.set("from", statementFrom || defaultStatementFrom);
      params.set("to", statementTo || defaultStatementTo);
      const response = await fetch(
        `/api/admin/investor-statements?${params.toString()}`,
        {
          cache: "no-store",
        },
      );
      const payload = await readJson<StatementPayload>(
        response,
        "Failed to load investor statements",
      );
      setStatementSummary(payload.summary);
      setStatementRows(payload.statements);
      const preferredInvestorId = selectedInvestorId
        ? String(selectedInvestorId)
        : payload.statements[0]
          ? String(payload.statements[0].investor.id)
          : "";
      setStatementDetailInvestorId((current) => {
        if (
          current &&
          payload.statements.some((item) => String(item.investor.id) === current)
        ) {
          return current;
        }
        return preferredInvestorId;
      });
    } catch (error: any) {
      toast.error(error?.message || "Failed to load investor statements");
    } finally {
      setLoadingStatementPreview(false);
    }
  }, [
    canReadStatement,
    defaultStatementFrom,
    defaultStatementTo,
    selectedInvestorId,
    statementFrom,
    statementTo,
  ]);

  useEffect(() => {
    if (!canReadStatement || section !== "statements") return;
    void loadStatementPreview();
  }, [canReadStatement, loadStatementPreview, section]);

  useEffect(() => {
    if (transactionForm.type === "ADJUSTMENT") return;
    setTransactionForm((current) => ({
      ...current,
      direction:
        current.type === "LOSS_ALLOCATION" ||
        current.type === "DISTRIBUTION" ||
        current.type === "WITHDRAWAL"
          ? "DEBIT"
          : "CREDIT",
    }));
  }, [transactionForm.type]);

  const createInvestor = async () => {
    try {
      const response = await fetch("/api/admin/investors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: investorName,
          email: investorEmail,
          phone: investorPhone,
          legalName: investorLegalName,
          taxNumber: investorTaxNumber,
          nationalIdNumber: investorNationalIdNumber,
          passportNumber: investorPassportNumber,
          bankName: investorBankName,
          bankAccountName: investorBankAccountName,
          bankAccountNumber: investorBankAccountNumber,
          notes: investorNotes,
        }),
      });
      await readJson(response, "Failed to create investor");
      setInvestorName("");
      setInvestorEmail("");
      setInvestorPhone("");
      setInvestorLegalName("");
      setInvestorTaxNumber("");
      setInvestorNationalIdNumber("");
      setInvestorPassportNumber("");
      setInvestorBankName("");
      setInvestorBankAccountName("");
      setInvestorBankAccountNumber("");
      setInvestorNotes("");
      toast.success("Investor created");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create investor");
    }
  };

  const createTransaction = async () => {
    try {
      const response = await fetch("/api/admin/investor-transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...transactionForm,
          investorId: Number(transactionForm.investorId),
          productVariantId: transactionForm.productVariantId
            ? Number(transactionForm.productVariantId)
            : null,
        }),
      });
      await readJson(response, "Failed to create transaction");
      setTransactionForm((current) => ({
        ...current,
        amount: "",
        productVariantId: "",
      }));
      toast.success("Transaction posted");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create transaction");
    }
  };

  const createAllocation = async () => {
    try {
      const response = await fetch("/api/admin/investor-allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...allocationForm,
          investorId: Number(allocationForm.investorId),
          productVariantId: Number(allocationForm.productVariantId),
        }),
      });
      await readJson(response, "Failed to create allocation");
      setAllocationForm((current) => ({
        ...current,
        participationPercent: "",
        committedAmount: "",
      }));
      toast.success("Allocation created");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create allocation");
    }
  };

  const runProfitCalculation = async () => {
    try {
      setRunningProfit(true);
      const response = await fetch("/api/admin/investor-profit-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profitRunForm),
      });
      const data = await readJson<{
        run: ProfitRun;
      }>(response, "Failed to run profitability calculation");
      toast.success(`Profit run ${data.run.runNumber} completed`);
      setSelectedProfitRunId(String(data.run.id));
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to run profitability calculation");
    } finally {
      setRunningProfit(false);
    }
  };

  const selectedProfitRun = useMemo(() => {
    if (!selectedProfitRunId) {
      return profitRuns[0] ?? null;
    }
    return (
      profitRuns.find((run) => String(run.id) === selectedProfitRunId) ?? null
    );
  }, [profitRuns, selectedProfitRunId]);

  const filteredProfitRuns = useMemo(() => {
    if (!profitStatusFilter) {
      return profitRuns;
    }
    return profitRuns.filter((run) => run.status === profitStatusFilter);
  }, [profitRuns, profitStatusFilter]);

  const filteredPayoutRegister = useMemo(() => {
    return payoutRegister.filter((item) => {
      if (payoutRunFilter && String(item.run.id) !== payoutRunFilter) {
        return false;
      }
      if (payoutStatusFilter && item.status !== payoutStatusFilter) {
        return false;
      }
      return true;
    });
  }, [payoutRegister, payoutRunFilter, payoutStatusFilter]);

  const changeProfitRunStatus = async (action: "approve" | "reject") => {
    if (!selectedProfitRun) {
      toast.error("Select a profit run first.");
      return;
    }
    try {
      setUpdatingRunStatus(true);
      const response = await fetch(
        `/api/admin/investor-profit-runs/${selectedProfitRun.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            note: runActionNote,
          }),
        },
      );
      await readJson(response, `Failed to ${action} run`);
      toast.success(
        action === "approve" ? "Profit run approved" : "Profit run rejected",
      );
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action} run`);
    } finally {
      setUpdatingRunStatus(false);
    }
  };

  const postSelectedRun = async () => {
    if (!selectedProfitRun) {
      toast.error("Select a profit run first.");
      return;
    }
    try {
      setPostingRun(true);
      const response = await fetch(
        `/api/admin/investor-profit-runs/${selectedProfitRun.id}/post`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            note: runActionNote,
          }),
        },
      );
      const result = await readJson<{ postedTransactionCount: number }>(
        response,
        "Failed to post run to ledger",
      );
      toast.success(
        `Posted ${result.postedTransactionCount} ledger transaction(s)`,
      );
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to post run");
    } finally {
      setPostingRun(false);
    }
  };

  const createPayout = async () => {
    if (!selectedProfitRun) {
      toast.error("Select a posted run first.");
      return;
    }
    try {
      setProcessingPayout(true);
      const response = await fetch(
        `/api/admin/investor-profit-runs/${selectedProfitRun.id}/payout`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payoutForm),
        },
      );
      const result = await readJson<{ payoutCount: number }>(
        response,
        "Failed to create investor payout draft",
      );
      toast.success(`Created ${result.payoutCount} payout draft(s)`);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || "Failed to create payout draft");
    } finally {
      setProcessingPayout(false);
    }
  };

  const processPayoutAction = async (
    payoutId: number,
    action: "approve" | "reject" | "pay" | "void",
  ) => {
    try {
      setActingPayoutId(payoutId);
      const payload: Record<string, string> = {
        action,
      };
      if (action === "approve" || action === "reject") {
        payload.note = payoutActionForm.note;
      }
      if (action === "pay") {
        payload.note = payoutActionForm.note;
        payload.paymentMethod = payoutActionForm.paymentMethod;
        payload.bankReference = payoutActionForm.bankReference;
        if (payoutActionForm.paidAt) {
          payload.paidAt = payoutActionForm.paidAt;
        }
      }
      if (action === "void") {
        payload.voidReason = payoutActionForm.voidReason;
      }

      const response = await fetch(`/api/admin/investor-payouts/${payoutId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await readJson(response, `Failed to ${action} payout`);
      const messageMap: Record<typeof action, string> = {
        approve: "Payout approved",
        reject: "Payout rejected",
        pay: "Payout settled",
        void: "Payout voided",
      };
      toast.success(messageMap[action]);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message || `Failed to ${action} payout`);
    } finally {
      setActingPayoutId(null);
    }
  };

  const exportStatementCsv = async () => {
    try {
      setExportingStatement(true);
      const params = new URLSearchParams();
      params.set("format", "csv");
      if (selectedInvestorId) {
        params.set("investorId", selectedInvestorId);
      }
      params.set("from", statementFrom || defaultStatementFrom);
      params.set("to", statementTo || defaultStatementTo);
      const response = await fetch(
        `/api/admin/investor-statements?${params.toString()}`,
        {
          cache: "no-store",
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          (payload as { error?: string }).error || "Failed to export statement",
        );
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "investor-statement.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Investor statement exported");
    } catch (error: any) {
      toast.error(error?.message || "Failed to export statement");
    } finally {
      setExportingStatement(false);
    }
  };

  const exportStatementPdfFile = async () => {
    try {
      setExportingStatement(true);
      const params = new URLSearchParams();
      if (selectedInvestorId) {
        params.set("investorId", selectedInvestorId);
      }
      params.set("from", statementFrom || defaultStatementFrom);
      params.set("to", statementTo || defaultStatementTo);

      const response = await fetch(
        `/api/admin/investor-statements?${params.toString()}`,
        {
          cache: "no-store",
        },
      );
      const payload = await readJson<{
        from: string;
        to: string;
        statements: Array<{
          investor: { code: string; name: string; status: string };
          totals: { credit: string; debit: string; net: string };
          transactions: Array<{
            transactionNumber: string;
            transactionDate: string;
            type: string;
            direction: string;
            amount: string;
          }>;
          payouts: Array<{
            payoutNumber: string;
            status: string;
            payoutAmount: string;
            createdAt: string;
            paidAt: string | null;
          }>;
        }>;
      }>(response, "Failed to load statement data");

      await exportInvestorStatementPdf({
        fileName: `investor-statement-${payload.from.slice(0, 10)}-to-${payload.to.slice(0, 10)}.pdf`,
        title: "Investor Statement",
        from: payload.from,
        to: payload.to,
        statements: payload.statements.map((statement) => ({
          investorCode: statement.investor.code,
          investorName: statement.investor.name,
          status: statement.investor.status,
          summary: statement.totals,
          transactions: statement.transactions.map((item) => ({
            ...item,
            currency: "BDT",
          })),
          payouts: statement.payouts.map((item) => ({
            ...item,
            currency: "BDT",
          })),
        })),
      });
      toast.success("Investor statement PDF exported");
    } catch (error: any) {
      toast.error(error?.message || "Failed to export statement PDF");
    } finally {
      setExportingStatement(false);
    }
  };

  const summary = useMemo(
    () => ({
      totalInvestors: investors.length,
      activeInvestors: investors.filter((item) => item.status === "ACTIVE")
        .length,
      totalBalance: investors.reduce(
        (sum, item) => sum + Number(item.totals.balance || 0),
        0,
      ),
      }),
    [investors],
  );

  const selectedStatementDetail = useMemo(
    () =>
      statementRows.find(
        (item) => String(item.investor.id) === statementDetailInvestorId,
      ) || null,
    [statementDetailInvestorId, statementRows],
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Investor Module</h1>
        <p className="text-sm text-muted-foreground">
          Investor onboarding, capital transactions, and product allocation.
          <span className="ml-1 font-medium text-foreground">
            Active view: {sectionTitleMap[section]}.
          </span>
        </p>
        {loading && !hasLoadedOnce ? (
          <p className="text-xs text-muted-foreground">
            Refreshing investor data...
          </p>
        ) : null}
      </div>

      <InvestorWorkflowGuide currentSection={section as InvestorWorkflowSection} />

      {!canAccessSelectedSection ? (
        <Card>
          <CardHeader>
            <CardTitle>Access Restricted</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You do not have permission to access the{" "}
              {sectionTitleMap[section]} view.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {canAccessSelectedSection ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Investors</p>
              <p className="text-xl font-semibold">{summary.totalInvestors}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Active Investors</p>
              <p className="text-xl font-semibold">{summary.activeInvestors}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Net Balance</p>
              <p className="text-xl font-semibold">
                {summary.totalBalance.toFixed(2)}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {canAccessSelectedSection && showSection("registry") ? (
        <Tabs defaultValue="forms" className="space-y-4">
          <TabsList className="flex h-9 w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground [&>*]:shrink-0">
            <TabsTrigger
              value="forms"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Create Investor
            </TabsTrigger>
            <TabsTrigger
              value="registry"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Investor Registry
            </TabsTrigger>
          </TabsList>

          <TabsContent value="forms" className="space-y-4">
            {canManageInvestors ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Create New Investor
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Add a new investor to the system with their contact
                    information.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="investor-name">Investor Name *</Label>
                      <Input
                        id="investor-name"
                        placeholder="Enter investor name"
                        value={investorName}
                        onChange={(event) =>
                          setInvestorName(event.target.value)
                        }
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="investor-email">Email Address</Label>
                      <Input
                        id="investor-email"
                        type="email"
                        placeholder="investor@example.com"
                        value={investorEmail}
                        onChange={(event) =>
                          setInvestorEmail(event.target.value)
                        }
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="investor-phone">Phone Number</Label>
                      <Input
                        id="investor-phone"
                        placeholder="+880 1XXX XXXXXX"
                        value={investorPhone}
                        onChange={(event) =>
                          setInvestorPhone(event.target.value)
                        }
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="investor-legal-name">Legal Name</Label>
                      <Input
                        id="investor-legal-name"
                        placeholder="Legal business name"
                        value={investorLegalName}
                        onChange={(event) =>
                          setInvestorLegalName(event.target.value)
                        }
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="investor-tax-number">Tax Number</Label>
                      <Input
                        id="investor-tax-number"
                        placeholder="TIN-1001"
                        value={investorTaxNumber}
                        onChange={(event) =>
                          setInvestorTaxNumber(event.target.value)
                        }
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="investor-nid">National ID Number</Label>
                      <Input
                        id="investor-nid"
                        placeholder="NID number"
                        value={investorNationalIdNumber}
                        onChange={(event) =>
                          setInvestorNationalIdNumber(event.target.value)
                        }
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="investor-passport">Passport Number</Label>
                      <Input
                        id="investor-passport"
                        placeholder="Passport number"
                        value={investorPassportNumber}
                        onChange={(event) =>
                          setInvestorPassportNumber(event.target.value)
                        }
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="investor-bank-name">Bank Name</Label>
                      <Input
                        id="investor-bank-name"
                        placeholder="DBBL"
                        value={investorBankName}
                        onChange={(event) =>
                          setInvestorBankName(event.target.value)
                        }
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="investor-bank-account-name">
                        Bank Account Name
                      </Label>
                      <Input
                        id="investor-bank-account-name"
                        placeholder="Account holder name"
                        value={investorBankAccountName}
                        onChange={(event) =>
                          setInvestorBankAccountName(event.target.value)
                        }
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="investor-bank-account-number">
                        Bank Account Number
                      </Label>
                      <Input
                        id="investor-bank-account-number"
                        placeholder="1234567890"
                        value={investorBankAccountNumber}
                        onChange={(event) =>
                          setInvestorBankAccountNumber(event.target.value)
                        }
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="investor-notes">Notes</Label>
                    <textarea
                      id="investor-notes"
                      placeholder="Additional notes about this investor"
                      value={investorNotes}
                      onChange={(event) => setInvestorNotes(event.target.value)}
                      className="w-full h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => void createInvestor()}
                      disabled={!investorName.trim()}
                      className="min-w-[120px]"
                    >
                      Create Investor
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    You don't have permission to create investors.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="registry" className="space-y-4">
            {canReadInvestors ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Investor Registry
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    View and manage all registered investors.
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="investor-filter"
                        className="text-sm font-medium"
                      >
                        Filter by Investor
                      </Label>
                      <div className="relative">
                        <select
                          id="investor-filter"
                          className="h-11 w-full rounded-lg border border-input bg-background px-4 pr-10 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-[320px] appearance-none"
                          value={selectedInvestorId}
                          onChange={(event) =>
                            setSelectedInvestorId(event.target.value)
                          }
                        >
                          <option value="">All Investors</option>
                          {investors.map((investor) => (
                            <option key={investor.id} value={investor.id}>
                              {investor.name} ({investor.code})
                            </option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                          <svg
                            className="h-4 w-4 text-muted-foreground"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center text-sm text-muted-foreground">
                      Total investors{" "}
                      <span className="font-medium p-1">
                        {investors.length}
                      </span>
                    </div>
                  </div>

                  <InvestorTable investors={investors} />
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    You don't have permission to view the investor registry.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : null}

      {canAccessSelectedSection && showSection("ledger") ? (
        <Tabs defaultValue="form" className="space-y-4">
          <TabsList className="flex h-9 w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground [&>*]:shrink-0">
            <TabsTrigger
              value="form"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Post Transaction
            </TabsTrigger>
            <TabsTrigger
              value="transactions"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Transaction History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="form" className="space-y-4">
            {canManageLedger ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Post Transaction
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Record capital transactions for investors.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="transaction-investor">Investor</Label>
                      <select
                        id="transaction-investor"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={transactionForm.investorId}
                        onChange={(event) =>
                          setTransactionForm((current) => ({
                            ...current,
                            investorId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select investor</option>
                        {investors.map((investor) => (
                          <option key={investor.id} value={investor.id}>
                            {investor.name} ({investor.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="transaction-type">Transaction Type</Label>
                      <select
                        id="transaction-type"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={transactionForm.type}
                        onChange={(event) =>
                          setTransactionForm((current) => ({
                            ...current,
                            type: event.target
                              .value as (typeof TRANSACTION_TYPES)[number],
                          }))
                        }
                      >
                        {TRANSACTION_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="transaction-direction">Direction</Label>
                      <select
                        id="transaction-direction"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        disabled={transactionForm.type !== "ADJUSTMENT"}
                        value={transactionForm.direction}
                        onChange={(event) =>
                          setTransactionForm((current) => ({
                            ...current,
                            direction: event.target.value as "DEBIT" | "CREDIT",
                          }))
                        }
                      >
                        <option value="CREDIT">CREDIT</option>
                        <option value="DEBIT">DEBIT</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="transaction-amount">Amount</Label>
                      <Input
                        id="transaction-amount"
                        placeholder="Enter amount"
                        value={transactionForm.amount}
                        onChange={(event) =>
                          setTransactionForm((current) => ({
                            ...current,
                            amount: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="transaction-variant">
                        Product Variant
                      </Label>
                      <select
                        id="transaction-variant"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={transactionForm.productVariantId}
                        onChange={(event) =>
                          setTransactionForm((current) => ({
                            ...current,
                            productVariantId: event.target.value,
                          }))
                        }
                      >
                        <option value="">General pool</option>
                        {variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.product.name} ({variant.sku})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => void createTransaction()}
                      disabled={
                        !transactionForm.investorId || !transactionForm.amount
                      }
                      className="min-w-[120px]"
                    >
                      Post Transaction
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    You don't have permission to post transactions.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            {canReadLedger ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Transaction History
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    View all capital transactions recorded in the ledger.
                  </p>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>No</TableHead>
                        <TableHead>Investor</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Direction</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Product</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/admin/investors/ledger/${item.id}`}
                              className="hover:text-primary"
                            >
                              {item.transactionNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/admin/investors/${item.investor.id}`}
                              className="hover:text-primary"
                            >
                              {item.investor.name}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                item.direction === "CREDIT"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {item.type}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                item.direction === "CREDIT"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-orange-100 text-orange-800"
                              }`}
                            >
                              {item.direction}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {Number(item.amount).toFixed(2)} {item.currency}
                          </TableCell>
                          <TableCell>
                            {item.productVariant
                              ? `${item.productVariant.product.name} (${item.productVariant.sku})`
                              : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    You don't have permission to view transactions.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : null}

      {canAccessSelectedSection && showSection("profit-runs") ? (
        <Tabs defaultValue="form" className="space-y-4">
          <TabsList className="flex h-9 w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground [&>*]:shrink-0">
            <TabsTrigger
              value="form"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Run Calculation
            </TabsTrigger>
            <TabsTrigger
              value="runs"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Profit Runs
            </TabsTrigger>
            <TabsTrigger
              value="workflow"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Workflow
            </TabsTrigger>
            <TabsTrigger
              value="analysis"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="form" className="space-y-4">
            {canManageProfit ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Run Product Profitability
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Calculate profit distribution across investors for a
                    specific period.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="profit-from">From Date</Label>
                      <Input
                        id="profit-from"
                        type="date"
                        value={profitRunForm.fromDate}
                        onChange={(event) =>
                          setProfitRunForm((current) => ({
                            ...current,
                            fromDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profit-to">To Date</Label>
                      <Input
                        id="profit-to"
                        type="date"
                        value={profitRunForm.toDate}
                        onChange={(event) =>
                          setProfitRunForm((current) => ({
                            ...current,
                            toDate: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="allocation-basis">Allocation Basis</Label>
                      <select
                        id="allocation-basis"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={profitRunForm.allocationBasis}
                        onChange={(event) =>
                          setProfitRunForm((current) => ({
                            ...current,
                            allocationBasis: event.target.value as
                              | "NET_REVENUE"
                              | "NET_UNITS",
                          }))
                        }
                      >
                        <option value="NET_REVENUE">NET_REVENUE</option>
                        <option value="NET_UNITS">NET_UNITS</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="marketing-expense">
                        Marketing Expense
                      </Label>
                      <Input
                        id="marketing-expense"
                        placeholder="Enter amount"
                        value={profitRunForm.marketingExpense}
                        onChange={(event) =>
                          setProfitRunForm((current) => ({
                            ...current,
                            marketingExpense: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ads-expense">Ads Expense</Label>
                      <Input
                        id="ads-expense"
                        placeholder="Enter amount"
                        value={profitRunForm.adsExpense}
                        onChange={(event) =>
                          setProfitRunForm((current) => ({
                            ...current,
                            adsExpense: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="logistics-expense">
                        Logistics Expense
                      </Label>
                      <Input
                        id="logistics-expense"
                        placeholder="Enter amount"
                        value={profitRunForm.logisticsExpense}
                        onChange={(event) =>
                          setProfitRunForm((current) => ({
                            ...current,
                            logisticsExpense: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="other-expense">Other Expense</Label>
                      <Input
                        id="other-expense"
                        placeholder="Enter amount"
                        value={profitRunForm.otherExpense}
                        onChange={(event) =>
                          setProfitRunForm((current) => ({
                            ...current,
                            otherExpense: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="profit-note">Note (Optional)</Label>
                    <Input
                      id="profit-note"
                      placeholder="Add any additional notes"
                      value={profitRunForm.note}
                      onChange={(event) =>
                        setProfitRunForm((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => void runProfitCalculation()}
                      disabled={runningProfit}
                      className="min-w-[180px]"
                    >
                      {runningProfit ? "Running..." : "Run Profit Calculation"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    You don't have permission to run profit calculations.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="runs" className="space-y-4">
            {canReadProfit ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Profit Runs History
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    View all profit calculation runs and their status.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="profit-run-select">Select Run</Label>
                    <select
                      id="profit-run-select"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm md:w-[460px]"
                      value={payoutRunFilter}
                      onChange={(event) =>
                        setPayoutRunFilter(event.target.value)
                      }
                    >
                      <option value="">Latest run</option>
                      {profitRuns.map((run) => (
                        <option key={run.id} value={run.id}>
                          {run.runNumber} • {run.fromDate.slice(0, 10)} to{" "}
                          {run.toDate.slice(0, 10)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="profit-status-filter">Run Status</Label>
                    <select
                      id="profit-status-filter"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm md:w-[240px]"
                      value={profitStatusFilter}
                      onChange={(event) =>
                        setProfitStatusFilter(event.target.value)
                      }
                    >
                      <option value="">All statuses</option>
                      <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="REJECTED">REJECTED</option>
                      <option value="POSTED">POSTED</option>
                    </select>
                  </div>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Run</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Basis</TableHead>
                          <TableHead>Net Revenue</TableHead>
                          <TableHead>Net COGS</TableHead>
                          <TableHead>Operating Expense</TableHead>
                          <TableHead>Net Profit</TableHead>
                          <TableHead>Approved</TableHead>
                          <TableHead>Posted</TableHead>
                          <TableHead>Lines</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredProfitRuns.map((run) => (
                          <TableRow key={run.id}>
                            <TableCell className="font-medium">
                              <Link
                                href={`/admin/investors/profit-runs/${run.id}`}
                                className="hover:text-primary"
                              >
                                {run.runNumber}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                  run.status === "POSTED"
                                    ? "bg-green-100 text-green-800"
                                    : run.status === "APPROVED"
                                      ? "bg-blue-100 text-blue-800"
                                      : run.status === "PENDING_APPROVAL"
                                        ? "bg-yellow-100 text-yellow-800"
                                        : "bg-red-100 text-red-800"
                                }`}
                              >
                                {run.status}
                              </span>
                            </TableCell>
                            <TableCell>{run.allocationBasis}</TableCell>
                            <TableCell className="text-right">
                              {Number(run.totalNetRevenue).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {Number(run.totalNetCogs).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {Number(run.totalOperatingExpense).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {Number(run.totalNetProfit).toFixed(2)}
                            </TableCell>
                            <TableCell>
                              {run.approvedAt
                                ? run.approvedAt.slice(0, 10)
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {run.postedAt ? run.postedAt.slice(0, 10) : "-"}
                            </TableCell>
                            <TableCell className="text-xs">
                              {run._count?.variantLines || 0} variants /{" "}
                              {run._count?.allocationLines || 0} allocations /{" "}
                              {run._count?.payouts || 0} payouts
                            </TableCell>
                          </TableRow>
                        ))}
                        {filteredProfitRuns.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={10}
                              className="text-center text-sm text-muted-foreground"
                            >
                              No profit runs matched the current filters.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    You don't have permission to view profit runs.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="workflow" className="space-y-4">
            {canReadProfit && selectedProfitRun ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Run Workflow Controls
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Manage the approval and posting workflow for profit runs.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Run</p>
                      <p className="font-medium">
                        {selectedProfitRun.runNumber}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <p className="font-medium">{selectedProfitRun.status}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Approved</p>
                      <p className="font-medium">
                        {selectedProfitRun.approvedAt
                          ? selectedProfitRun.approvedAt
                              .slice(0, 19)
                              .replace("T", " ")
                          : "-"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">Posted</p>
                      <p className="font-medium">
                        {selectedProfitRun.postedAt
                          ? selectedProfitRun.postedAt
                              .slice(0, 19)
                              .replace("T", " ")
                          : "-"}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="workflow-note">
                      Governance Note (Optional)
                    </Label>
                    <Input
                      id="workflow-note"
                      placeholder="Add governance notes for this action"
                      value={runActionNote}
                      onChange={(event) => setRunActionNote(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canApproveProfit &&
                    selectedProfitRun.status === "PENDING_APPROVAL" ? (
                      <>
                        <Button
                          onClick={() => void changeProfitRunStatus("approve")}
                          disabled={updatingRunStatus}
                        >
                          {updatingRunStatus ? "Updating..." : "Approve Run"}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void changeProfitRunStatus("reject")}
                          disabled={updatingRunStatus}
                        >
                          {updatingRunStatus ? "Updating..." : "Reject Run"}
                        </Button>
                      </>
                    ) : null}
                    {canPostProfit &&
                    selectedProfitRun.status === "APPROVED" ? (
                      <Button
                        onClick={() => void postSelectedRun()}
                        disabled={postingRun}
                      >
                        {postingRun ? "Posting..." : "Post To Investor Ledger"}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    Select a profit run to view workflow controls.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analysis" className="space-y-4">
            {canReadProfit ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold">
                      Variant Profit Lines
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Profit breakdown by product variants.
                    </p>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Variant</TableHead>
                          <TableHead>Units (Net)</TableHead>
                          <TableHead>Net Revenue</TableHead>
                          <TableHead>Net COGS</TableHead>
                          <TableHead>Allocated Expense</TableHead>
                          <TableHead>Net Profit</TableHead>
                          <TableHead>Unallocated %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profitVariantLines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell className="font-medium">
                              {line.productVariant.product.name} (
                              {line.productVariant.sku})
                            </TableCell>
                            <TableCell className="text-right">
                              {line.unitsNet}
                            </TableCell>
                            <TableCell className="text-right">
                              {Number(line.netRevenue).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {Number(line.netCogs).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {Number(line.allocatedExpense).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {Number(line.netProfit).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {(Number(line.unallocatedSharePct) * 100).toFixed(
                                2,
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold">
                      Investor Profit Share Lines
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Profit distribution across investors.
                    </p>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Investor</TableHead>
                          <TableHead>Variant</TableHead>
                          <TableHead>Share %</TableHead>
                          <TableHead>Allocated Revenue</TableHead>
                          <TableHead>Allocated Net Profit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profitAllocationLines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell className="font-medium">
                              {line.investor.name} ({line.investor.code})
                            </TableCell>
                            <TableCell>
                              {line.productVariant.product.name} (
                              {line.productVariant.sku})
                            </TableCell>
                            <TableCell className="text-right">
                              {(
                                Number(line.participationSharePct) * 100
                              ).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {Number(line.allocatedRevenue).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {Number(line.allocatedNetProfit).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    You don't have permission to view profit analysis.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : null}

      {canAccessSelectedSection && showSection("payouts") ? (
        <Tabs defaultValue="form" className="space-y-4">
          <TabsList className="flex h-9 w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground [&>*]:shrink-0">
            <TabsTrigger
              value="form"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Create Payout
            </TabsTrigger>
            <TabsTrigger
              value="register"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Payout Register
            </TabsTrigger>
          </TabsList>

          <TabsContent value="form" className="space-y-4">
            {canManagePayout && selectedProfitRun?.status === "POSTED" ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Create Payout Draft
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Generate payout drafts for investors based on profit
                    distribution.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="payout-percent">Payout % (0-100)</Label>
                      <Input
                        id="payout-percent"
                        placeholder="Enter percentage"
                        value={payoutForm.payoutPercent}
                        onChange={(event) =>
                          setPayoutForm((current) => ({
                            ...current,
                            payoutPercent: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="holdback-percent">
                        Holdback % (0-100)
                      </Label>
                      <Input
                        id="holdback-percent"
                        placeholder="Enter percentage"
                        value={payoutForm.holdbackPercent}
                        onChange={(event) =>
                          setPayoutForm((current) => ({
                            ...current,
                            holdbackPercent: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payout-currency">Currency</Label>
                      <Input
                        id="payout-currency"
                        placeholder="Enter currency"
                        value={payoutForm.currency}
                        onChange={(event) =>
                          setPayoutForm((current) => ({
                            ...current,
                            currency: event.target.value.toUpperCase(),
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="payout-note">Payout Note (Optional)</Label>
                    <Input
                      id="payout-note"
                      placeholder="Add any additional notes"
                      value={payoutForm.note}
                      onChange={(event) =>
                        setPayoutForm((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => void createPayout()}
                      disabled={processingPayout}
                      className="min-w-[160px]"
                    >
                      {processingPayout
                        ? "Processing..."
                        : "Create Payout Draft"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    {!selectedProfitRun
                      ? "Select a posted profit run first."
                      : selectedProfitRun?.status !== "POSTED"
                        ? "Only posted profit runs can generate payouts."
                        : "You don't have permission to create payouts."}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="register" className="space-y-4">
            {canReadPayout ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Payout Register
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    View and manage all payout records and their status.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 overflow-x-auto">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="payout-run-filter">Profit Run</Label>
                      <select
                        id="payout-run-filter"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={selectedProfitRunId}
                        onChange={(event) =>
                          setSelectedProfitRunId(event.target.value)
                        }
                      >
                        <option value="">All runs</option>
                        {profitRuns.map((run) => (
                          <option key={run.id} value={run.id}>
                            {run.runNumber}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="payout-status-filter">
                        Payout Status
                      </Label>
                      <select
                        id="payout-status-filter"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={payoutStatusFilter}
                        onChange={(event) =>
                          setPayoutStatusFilter(event.target.value)
                        }
                      >
                        <option value="">All statuses</option>
                        <option value="PENDING_APPROVAL">
                          PENDING_APPROVAL
                        </option>
                        <option value="APPROVED">APPROVED</option>
                        <option value="REJECTED">REJECTED</option>
                        <option value="PAID">PAID</option>
                        <option value="VOID">VOID</option>
                      </select>
                    </div>
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">
                        Visible Payouts
                      </p>
                      <p className="text-2xl font-semibold">
                        {filteredPayoutRegister.length}
                      </p>
                    </div>
                  </div>
                  {canApprovePayout || canPayPayout || canVoidPayout ? (
                    <div className="grid gap-4 md:grid-cols-5">
                      <div className="space-y-2">
                        <Label htmlFor="action-note">Action Note</Label>
                        <Input
                          id="action-note"
                          placeholder="Enter note"
                          value={payoutActionForm.note}
                          onChange={(event) =>
                            setPayoutActionForm((current) => ({
                              ...current,
                              note: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="payment-method">Payment Method</Label>
                        <select
                          id="payment-method"
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={payoutActionForm.paymentMethod}
                          onChange={(event) =>
                            setPayoutActionForm((current) => ({
                              ...current,
                              paymentMethod: event.target.value as
                                | "BANK_TRANSFER"
                                | "MOBILE_BANKING"
                                | "CHEQUE"
                                | "CASH",
                            }))
                          }
                        >
                          <option value="BANK_TRANSFER">BANK_TRANSFER</option>
                          <option value="MOBILE_BANKING">MOBILE_BANKING</option>
                          <option value="CHEQUE">CHEQUE</option>
                          <option value="CASH">CASH</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="bank-reference">Bank Reference</Label>
                        <Input
                          id="bank-reference"
                          placeholder="Enter reference"
                          value={payoutActionForm.bankReference}
                          onChange={(event) =>
                            setPayoutActionForm((current) => ({
                              ...current,
                              bankReference: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="paid-at">Paid At</Label>
                        <Input
                          id="paid-at"
                          type="datetime-local"
                          value={payoutActionForm.paidAt}
                          onChange={(event) =>
                            setPayoutActionForm((current) => ({
                              ...current,
                              paidAt: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="void-reason">Void Reason</Label>
                        <Input
                          id="void-reason"
                          placeholder="Enter reason"
                          value={payoutActionForm.voidReason}
                          onChange={(event) =>
                            setPayoutActionForm((current) => ({
                              ...current,
                              voidReason: event.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payout</TableHead>
                        <TableHead>Run</TableHead>
                        <TableHead>Investor</TableHead>
                        <TableHead>Gross Profit</TableHead>
                        <TableHead>Holdback</TableHead>
                        <TableHead>Payout Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Bank Ref</TableHead>
                        <TableHead>Timeline</TableHead>
                        <TableHead>Ledger Txn</TableHead>
                        {canApprovePayout || canPayPayout || canVoidPayout ? (
                          <TableHead>Actions</TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPayoutRegister.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/admin/investors/payouts/${item.id}`}
                              className="hover:text-primary"
                            >
                              {item.payoutNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Link
                              href={`/admin/investors/profit-runs/${item.run.id}`}
                              className="hover:text-primary"
                            >
                              {item.run.runNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <div>
                              {item.investor.name} ({item.investor.code})
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Beneficiary{" "}
                              {item.investor.beneficiaryVerifiedAt
                                ? "verified"
                                : "pending"}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(item.grossProfitAmount).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {Number(item.holdbackAmount).toFixed(2)} (
                            {Number(item.holdbackPercent).toFixed(2)}%)
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {Number(item.payoutAmount).toFixed(2)}{" "}
                            {item.currency}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                item.status === "PAID"
                                  ? "bg-green-100 text-green-800"
                                  : item.status === "APPROVED"
                                    ? "bg-blue-100 text-blue-800"
                                    : item.status === "PENDING_APPROVAL"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : item.status === "VOID"
                                        ? "bg-red-100 text-red-800"
                                        : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {item.status}
                            </span>
                          </TableCell>
                          <TableCell>{item.paymentMethod || "-"}</TableCell>
                          <TableCell>{item.bankReference || "-"}</TableCell>
                          <TableCell className="text-xs">
                            <div>
                              A:{" "}
                              {item.approvedAt
                                ? item.approvedAt.slice(0, 10)
                                : "-"}
                            </div>
                            <div>
                              H: {item.heldAt ? item.heldAt.slice(0, 10) : "-"}
                            </div>
                            <div>
                              R:{" "}
                              {item.releasedAt
                                ? item.releasedAt.slice(0, 10)
                                : "-"}
                            </div>
                            <div>
                              P: {item.paidAt ? item.paidAt.slice(0, 10) : "-"}
                            </div>
                            <div>
                              V:{" "}
                              {item.voidedAt ? item.voidedAt.slice(0, 10) : "-"}
                            </div>
                          </TableCell>
                          <TableCell>
                            {item.transaction?.transactionNumber ?? "-"}
                          </TableCell>
                          {canApprovePayout || canPayPayout || canVoidPayout ? (
                            <TableCell>
                              <div className="flex flex-wrap gap-2">
                                {canApprovePayout &&
                                item.status === "PENDING_APPROVAL" ? (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        void processPayoutAction(
                                          item.id,
                                          "approve",
                                        )
                                      }
                                      disabled={actingPayoutId === item.id}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        void processPayoutAction(
                                          item.id,
                                          "reject",
                                        )
                                      }
                                      disabled={actingPayoutId === item.id}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                ) : null}
                                {canPayPayout && item.status === "APPROVED" ? (
                                  <Button
                                    size="sm"
                                    onClick={() =>
                                      void processPayoutAction(item.id, "pay")
                                    }
                                    disabled={actingPayoutId === item.id}
                                  >
                                    Pay
                                  </Button>
                                ) : null}
                                {canVoidPayout &&
                                (item.status === "APPROVED" ||
                                  item.status === "PAID") ? (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() =>
                                      void processPayoutAction(item.id, "void")
                                    }
                                    disabled={actingPayoutId === item.id}
                                  >
                                    Void
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          ) : null}
                        </TableRow>
                      ))}
                      {filteredPayoutRegister.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={
                              canApprovePayout || canPayPayout || canVoidPayout
                                ? 12
                                : 11
                            }
                            className="text-center text-sm text-muted-foreground"
                          >
                            No payouts matched the current filters.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    You don't have permission to view the payout register.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : null}

      {canAccessSelectedSection && showSection("allocations") ? (
        <Tabs defaultValue="form" className="space-y-4">
          <TabsList className="flex h-9 w-full items-center justify-start gap-1 overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground [&>*]:shrink-0">
            <TabsTrigger
              value="form"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              Create Allocation
            </TabsTrigger>
            <TabsTrigger
              value="allocations"
              className="inline-flex items-center justify-start whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow"
            >
              View Allocations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="form" className="space-y-4">
            {canManageAllocations ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Create Allocation
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Allocate investors to product variants with participation
                    terms.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="allocation-investor">Investor</Label>
                      <select
                        id="allocation-investor"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={allocationForm.investorId}
                        onChange={(event) =>
                          setAllocationForm((current) => ({
                            ...current,
                            investorId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select investor</option>
                        {investors.map((investor) => (
                          <option key={investor.id} value={investor.id}>
                            {investor.name} ({investor.code})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="allocation-variant">
                        Product Variant
                      </Label>
                      <select
                        id="allocation-variant"
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        value={allocationForm.productVariantId}
                        onChange={(event) =>
                          setAllocationForm((current) => ({
                            ...current,
                            productVariantId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select variant</option>
                        {variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.product.name} ({variant.sku})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="allocation-participation">
                        Participation %
                      </Label>
                      <Input
                        id="allocation-participation"
                        placeholder="Enter percentage"
                        value={allocationForm.participationPercent}
                        onChange={(event) =>
                          setAllocationForm((current) => ({
                            ...current,
                            participationPercent: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="allocation-committed">
                        Committed Amount
                      </Label>
                      <Input
                        id="allocation-committed"
                        placeholder="Enter amount"
                        value={allocationForm.committedAmount}
                        onChange={(event) =>
                          setAllocationForm((current) => ({
                            ...current,
                            committedAmount: event.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => void createAllocation()}
                      disabled={
                        !allocationForm.investorId ||
                        !allocationForm.productVariantId
                      }
                      className="min-w-[120px]"
                    >
                      Create Allocation
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    You don't have permission to create allocations.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="allocations" className="space-y-4">
            {canReadAllocations ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">
                    Investor Allocations
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    View all investor allocations to product variants.
                  </p>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Allocation</TableHead>
                          <TableHead>Investor</TableHead>
                          <TableHead>Variant</TableHead>
                          <TableHead>Participation %</TableHead>
                          <TableHead>Committed</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allocations.map((item) => (
                          <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/admin/investors/allocations/${item.id}`}
                              className="hover:text-primary"
                            >
                              Allocation #{item.id}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              Open allocation detail
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">
                            <Link
                              href={`/admin/investors/${item.investor.id}`}
                              className="hover:text-primary"
                            >
                              {item.investor.name}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              Investor profile
                            </div>
                          </TableCell>
                          <TableCell>
                            {item.productVariant.product.name} ({item.productVariant.sku})
                          </TableCell>
                          <TableCell className="text-right">
                            {item.participationPercent || "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.committedAmount || "-"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                item.status === "ACTIVE"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-gray-100 text-gray-800"
                              }`}
                            >
                              {item.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/admin/investors/allocations/${item.id}`}>
                                Open Detail
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {allocations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                            No allocations found.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-6">
                  <p className="text-center text-muted-foreground">
                    You don't have permission to view allocations.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      ) : null}

      {canAccessSelectedSection &&
      showSection("statements") &&
      canReadStatement ? (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Investor Statements</CardTitle>
              <p className="text-sm text-muted-foreground">
                Review investor statement scope, preview ledger and payout
                activity, then export the selected range.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="statement-investor">Investor Scope</Label>
                  <div className="relative">
                    <select
                      id="statement-investor"
                      className="h-11 w-full rounded-lg border border-input bg-background px-4 pr-10 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 appearance-none"
                      value={selectedInvestorId}
                      onChange={(event) =>
                        setSelectedInvestorId(event.target.value)
                      }
                    >
                      <option value="">All Investors</option>
                      {investors.map((investor) => (
                        <option key={investor.id} value={investor.id}>
                          {investor.name} ({investor.code})
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                      <svg
                        className="h-4 w-4 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="statement-from">From</Label>
                  <Input
                    id="statement-from"
                    type="date"
                    value={statementFrom}
                    onChange={(event) => setStatementFrom(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="statement-to">To</Label>
                  <Input
                    id="statement-to"
                    type="date"
                    value={statementTo}
                    onChange={(event) => setStatementTo(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Actions</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => void loadStatementPreview()}
                      disabled={loadingStatementPreview}
                    >
                      {loadingStatementPreview ? "Refreshing..." : "Apply"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void exportStatementCsv()}
                      disabled={exportingStatement}
                    >
                      {exportingStatement ? "Exporting..." : "Export CSV"}
                    </Button>
                    <Button
                      onClick={() => void exportStatementPdfFile()}
                      disabled={exportingStatement}
                    >
                      {exportingStatement ? "Exporting..." : "Export PDF"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Investors In Scope
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {statementSummary.investorCount}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Transactions
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {statementSummary.transactionCount}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Payouts
                  </p>
                  <p className="mt-2 text-2xl font-semibold">
                    {statementSummary.payoutCount}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total Credit
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {formatMoney(statementSummary.totalCredit)}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Total Debit
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {formatMoney(statementSummary.totalDebit)}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Net Movement
                  </p>
                  <p className="mt-2 text-xl font-semibold">
                    {formatMoney(statementSummary.totalNet)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/20 p-4 text-sm">
                <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="font-medium">Statement Period</p>
                    <p className="text-muted-foreground">
                      {formatDateTime(
                        `${statementFrom || defaultStatementFrom}T00:00:00`,
                      )}{" "}
                      to{" "}
                      {formatDateTime(
                        `${statementTo || defaultStatementTo}T23:59:59`,
                      )}
                    </p>
                  </div>
                  <div className="text-muted-foreground">
                    Scope:{" "}
                    <span className="font-medium text-foreground">
                      {selectedInvestorId
                        ? investors.find(
                            (item) => String(item.id) === selectedInvestorId,
                          )?.name || "Selected investor"
                        : "All investors"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Investor Statement Register</CardTitle>
              <p className="text-sm text-muted-foreground">
                Each row shows the statement result for one investor in the
                selected scope.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Investor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead className="text-right">Payouts</TableHead>
                    <TableHead className="text-right">Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statementRows.map((row) => {
                    const isSelected =
                      String(row.investor.id) === statementDetailInvestorId;
                    return (
                      <TableRow key={row.investor.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <button
                              type="button"
                              className="text-left font-medium hover:text-primary"
                              onClick={() =>
                                setStatementDetailInvestorId(
                                  String(row.investor.id),
                                )
                              }
                            >
                              {row.investor.name}
                            </button>
                            <p className="text-xs text-muted-foreground">
                              {row.investor.code}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{row.investor.status}</TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.totals.credit)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatMoney(row.totals.debit)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatMoney(row.totals.net)}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.counts.transactionCount}
                        </TableCell>
                        <TableCell className="text-right">
                          {row.counts.payoutCount}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant={isSelected ? "default" : "outline"}
                            onClick={() =>
                              setStatementDetailInvestorId(
                                String(row.investor.id),
                              )
                            }
                          >
                            {isSelected ? "Viewing" : "View Detail"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {statementRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="text-center text-sm text-muted-foreground"
                      >
                        {loadingStatementPreview
                          ? "Loading statement preview..."
                          : "No statement data found for the selected scope."}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>

          {selectedStatementDetail ? (
            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle>
                    Statement Detail: {selectedStatementDetail.investor.name}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Full transaction and payout activity for the selected
                    investor.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-5">
                    <div className="rounded-lg border p-3 md:col-span-2">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Investor
                      </p>
                      <p className="mt-2 text-base font-semibold">
                        {selectedStatementDetail.investor.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {selectedStatementDetail.investor.code}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Credit
                      </p>
                      <p className="mt-2 font-semibold">
                        {formatMoney(selectedStatementDetail.totals.credit)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Debit
                      </p>
                      <p className="mt-2 font-semibold">
                        {formatMoney(selectedStatementDetail.totals.debit)}
                      </p>
                    </div>
                    <div className="rounded-lg border p-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Net
                      </p>
                      <p className="mt-2 font-semibold">
                        {formatMoney(selectedStatementDetail.totals.net)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">
                        Ledger Transactions
                      </h3>
                      <span className="text-xs text-muted-foreground">
                        {selectedStatementDetail.counts.transactionCount} item(s)
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>No</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Direction</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedStatementDetail.transactions.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.transactionNumber}
                            </TableCell>
                            <TableCell>
                              {formatDateTime(item.transactionDate)}
                            </TableCell>
                            <TableCell>{item.type}</TableCell>
                            <TableCell>{item.direction}</TableCell>
                            <TableCell className="text-right">
                              {formatMoney(item.amount, item.currency)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {selectedStatementDetail.transactions.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="text-center text-sm text-muted-foreground"
                            >
                              No transactions in the selected date range.
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Payout Activity</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Payout records created within the selected statement period.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Payout Count
                      </p>
                      <p className="mt-1 text-xl font-semibold">
                        {selectedStatementDetail.counts.payoutCount}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        Investor Status
                      </p>
                      <p className="mt-1 font-medium">
                        {selectedStatementDetail.investor.status}
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payout</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Paid</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedStatementDetail.payouts.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.payoutNumber}
                          </TableCell>
                          <TableCell>{item.status}</TableCell>
                          <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                          <TableCell>{formatDateTime(item.paidAt)}</TableCell>
                          <TableCell className="text-right">
                            {formatMoney(item.payoutAmount, item.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {selectedStatementDetail.payouts.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center text-sm text-muted-foreground"
                          >
                            No payouts in the selected date range.
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
