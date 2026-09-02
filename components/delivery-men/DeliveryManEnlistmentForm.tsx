"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import Tesseract from "tesseract.js";
import { initialFormData, steps } from "./constants";
import {
  DeliveryManFormData,
  ParsedDocumentData,
  ReferencePerson,
} from "./types";
import { parseDocumentText } from "@/lib/document-parser";

type ErrorState = Record<string, string>;

type UploadedDocument = {
  type: string;
  fileUrl: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  referenceIndex?: number;
};

type WarehouseOption = {
  id: number;
  name: string;
  code?: string;
};

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch("/api/upload/delivery-man-documents", {
    method: "POST",
    body: fd,
  });

  const text = await res.text();

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Upload route did not return valid JSON");
  }

  const fileUrl =
    typeof data.fileUrl === "string"
      ? data.fileUrl
      : typeof data.url === "string"
        ? data.url
        : "";

  if (!res.ok || !data.success || !fileUrl) {
    throw new Error(data.error || data.message || "File upload failed");
  }

  return fileUrl;
}

async function uploadDeliveryManDocuments(params: {
  profilePhoto?: File | null;
  identityFrontFile?: File | null;
  identityBackFile?: File | null;
  fatherIdentityFrontFile?: File | null;
  fatherIdentityBackFile?: File | null;
  motherIdentityFrontFile?: File | null;
  motherIdentityBackFile?: File | null;
  bankChequeFile?: File | null;
  bondDocumentFile?: File | null;
  contractPaperFile?: File | null;
  signatureFile?: File | null;
  references?: Array<{
    identityFrontFile?: File | null;
    identityBackFile?: File | null;
  }>;
}): Promise<UploadedDocument[]> {
  const documents: UploadedDocument[] = [];

  async function pushFile(
    type: string,
    file?: File | null,
    extra?: Partial<UploadedDocument>
  ) {
    if (!file) return;

    const fileUrl = await uploadFile(file);

    documents.push({
      type,
      fileUrl,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      ...extra,
    });
  }

  await pushFile("PROFILE_PHOTO", params.profilePhoto);

  await pushFile("IDENTITY_FRONT", params.identityFrontFile);
  await pushFile("IDENTITY_BACK", params.identityBackFile);

  await pushFile("FATHER_IDENTITY_FRONT", params.fatherIdentityFrontFile);
  await pushFile("FATHER_IDENTITY_BACK", params.fatherIdentityBackFile);

  await pushFile("MOTHER_IDENTITY_FRONT", params.motherIdentityFrontFile);
  await pushFile("MOTHER_IDENTITY_BACK", params.motherIdentityBackFile);

  await pushFile("BANK_CHEQUE", params.bankChequeFile);
  await pushFile("BOND", params.bondDocumentFile);
  await pushFile("CONTRACT_PAPER", params.contractPaperFile);
  

  if (params.references?.length) {
    for (let i = 0; i < params.references.length; i++) {
      const ref = params.references[i];

      await pushFile("REFERENCE_IDENTITY_FRONT", ref.identityFrontFile, {
        referenceIndex: i,
      });

      await pushFile("REFERENCE_IDENTITY_BACK", ref.identityBackFile, {
        referenceIndex: i,
      });
    }
  }

  return documents;
}

export default function DeliveryManEnlistmentForm() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<DeliveryManFormData>(initialFormData);
  const [errors, setErrors] = useState<ErrorState>({});
  const [isReadingDoc, setIsReadingDoc] = useState(false);
  const [ocrMessage, setOcrMessage] = useState("");
  const [rawExtractedText, setRawExtractedText] = useState("");
  const [parsedDoc, setParsedDoc] = useState<ParsedDocumentData | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [isLoadingWarehouses, setIsLoadingWarehouses] = useState(false);
  const [warehouseLoadError, setWarehouseLoadError] = useState("");

  const progress = useMemo(
    () => ((currentStep + 1) / steps.length) * 100,
    [currentStep]
  );

  useEffect(() => {
    const loadWarehouses = async () => {
      try {
        setIsLoadingWarehouses(true);
        setWarehouseLoadError("");

        const res = await fetch("/api/warehouses", {
          method: "GET",
          cache: "no-store",
        });

        const text = await res.text();

        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          throw new Error("/api/warehouses did not return valid JSON");
        }

        if (!res.ok) {
          throw new Error(data.message || data.error || "Failed to load warehouses");
        }

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data.data)
          ? data.data
          : Array.isArray(data.warehouses)
          ? data.warehouses
          : [];

        const normalized: WarehouseOption[] = list
          .map((item: any) => ({
            id: Number(item.id),
            name: String(item.name ?? ""),
            code: item.code ? String(item.code) : undefined,
          }))
          .filter((item: WarehouseOption) => item.id && item.name);

        setWarehouses(normalized);
      } catch (error) {
        console.error("WAREHOUSE LOAD ERROR:", error);
        setWarehouseLoadError(
          error instanceof Error ? error.message : "Failed to load warehouses"
        );
      } finally {
        setIsLoadingWarehouses(false);
      }
    };

    loadWarehouses();
  }, []);

  const selectedWarehouseLabel = useMemo(() => {
    const found = warehouses.find((w) => String(w.id) === formData.warehouse);
    if (!found) return formData.warehouse || "—";
    return found.code ? `${found.name} (${found.code})` : found.name;
  }, [warehouses, formData.warehouse]);

  const updateField = <K extends keyof DeliveryManFormData>(
    key: K,
    value: DeliveryManFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key as string]: "" }));
  };

  const updateReference = <K extends keyof ReferencePerson>(
    index: number,
    key: K,
    value: ReferencePerson[K]
  ) => {
    setFormData((prev) => {
      const next = [...prev.references];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, references: next };
    });
    setErrors((prev) => ({
      ...prev,
      [`references.${index}.${String(key)}`]: "",
    }));
  };

  const addReference = () => {
    setFormData((prev) => ({
      ...prev,
      references: [
        ...prev.references,
        {
          name: "",
          phone: "",
          relation: "",
          address: "",
          occupation: "",
          identityType: "NID",
          identityNumber: "",
          identityFrontFile: null,
          identityBackFile: null,
        },
      ],
    }));
  };

  const removeReference = (index: number) => {
    if (formData.references.length <= 2) return;
    setFormData((prev) => ({
      ...prev,
      references: prev.references.filter((_, i) => i !== index),
    }));
  };

  const handleFileChange = (
    event: ChangeEvent<HTMLInputElement>,
    field: keyof DeliveryManFormData
  ) => {
    const file = event.target.files?.[0] ?? null;
    updateField(field, file as DeliveryManFormData[keyof DeliveryManFormData]);
  };

  const handleReferenceFileChange = (
    event: ChangeEvent<HTMLInputElement>,
    index: number,
    field: keyof ReferencePerson
  ) => {
    const file = event.target.files?.[0] ?? null;
    updateReference(index, field, file as ReferencePerson[keyof ReferencePerson]);
  };

  const applyDetectedValues = (parsed: ParsedDocumentData) => {
    setFormData((prev) => ({
      ...prev,
      identityType:
        parsed.documentType === "PASSPORT"
          ? "PASSPORT"
          : parsed.documentType === "NID"
          ? "NID"
          : prev.identityType,
      fullName: parsed.fullName || prev.fullName,
      identityNumber: parsed.identityNumber || prev.identityNumber,
      dateOfBirth: parsed.dateOfBirth || prev.dateOfBirth,
      passportExpiryDate: parsed.passportExpiryDate || prev.passportExpiryDate,
    }));
  };

  const runClientOcr = async (file: File) => {
    setIsReadingDoc(true);
    setOcrMessage("Reading document...");
    setParsedDoc(null);
    setRawExtractedText("");

    try {
      const result = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status) {
            setOcrMessage(
              `${m.status}${
                m.progress ? ` (${Math.round(m.progress * 100)}%)` : ""
              }`
            );
          }
        },
      });

      const text = result.data.text || "";
      const parsed = parseDocumentText(text);

      setRawExtractedText(text);
      setParsedDoc(parsed);
      applyDetectedValues(parsed);
      setOcrMessage(
        "Document read complete. Please verify the detected values."
      );
    } catch (error) {
      console.error(error);
      setOcrMessage("Could not read the document. Please fill the fields manually.");
    } finally {
      setIsReadingDoc(false);
    }
  };

  const handleOcrDocumentUpload = async (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    updateField("identityFrontFile", file);
    await runClientOcr(file);
  };

  const validateStep = () => {
    const nextErrors: ErrorState = {};

    if (currentStep === 1) {
      if (!formData.fullName.trim()) nextErrors.fullName = "Full name is required";
      if (!formData.mobileNumber.trim())
        nextErrors.mobileNumber = "Mobile number is required";
      if (!formData.password.trim())
        nextErrors.password = "Password is required";
      if (!formData.dateOfBirth)
        nextErrors.dateOfBirth = "Date of birth is required";
      if (!formData.gender) nextErrors.gender = "Gender is required";
      if (!formData.presentAddress.trim())
        nextErrors.presentAddress = "Present address is required";
      if (!formData.permanentAddress.trim())
        nextErrors.permanentAddress = "Permanent address is required";
      if (!formData.emergencyContactName.trim())
        nextErrors.emergencyContactName = "Emergency contact name is required";
      if (!formData.emergencyContactNumber.trim())
        nextErrors.emergencyContactNumber =
          "Emergency contact number is required";
      if (!formData.emergencyContactRelation.trim())
        nextErrors.emergencyContactRelation =
          "Emergency contact relation is required";
    }

    if (currentStep === 2) {
      if (!formData.identityNumber.trim())
        nextErrors.identityNumber = "Identity number is required";
      if (!formData.identityFrontFile)
        nextErrors.identityFrontFile = "Identity document is required";
      if (formData.identityType === "PASSPORT" && !formData.passportExpiryDate) {
        nextErrors.passportExpiryDate = "Passport expiry date is required";
      }
    }

    if (currentStep === 3) {
      if (!formData.fatherName.trim())
        nextErrors.fatherName = "Father's name is required";
      if (!formData.fatherIdentityNumber.trim())
        nextErrors.fatherIdentityNumber =
          "Father's identity number is required";
      if (!formData.fatherIdentityFrontFile)
        nextErrors.fatherIdentityFrontFile =
          "Father's identity copy is required";
      if (!formData.motherName.trim())
        nextErrors.motherName = "Mother's name is required";
      if (!formData.motherIdentityNumber.trim())
        nextErrors.motherIdentityNumber =
          "Mother's identity number is required";
      if (!formData.motherIdentityFrontFile)
        nextErrors.motherIdentityFrontFile =
          "Mother's identity copy is required";
    }

    if (currentStep === 4) {
      formData.references.forEach((ref, index) => {
        if (!ref.name.trim())
          nextErrors[`references.${index}.name`] = "Name is required";
        if (!ref.phone.trim())
          nextErrors[`references.${index}.phone`] = "Phone is required";
        if (!ref.relation.trim())
          nextErrors[`references.${index}.relation`] = "Relation is required";
        if (!ref.address.trim())
          nextErrors[`references.${index}.address`] = "Address is required";
        if (!ref.identityNumber.trim())
          nextErrors[`references.${index}.identityNumber`] =
            "Identity number is required";
        if (!ref.identityFrontFile)
          nextErrors[`references.${index}.identityFrontFile`] =
            "Identity file is required";
      });
    }

    if (currentStep === 5) {
      if (!formData.bankName.trim()) nextErrors.bankName = "Bank name is required";
      if (!formData.bankChequeFile)
        nextErrors.bankChequeFile = "Bank cheque is required";
      if (!formData.bondDocumentFile)
        nextErrors.bondDocumentFile = "Bond document is required";
      if (!formData.contractPaperFile)
        nextErrors.contractPaperFile = "Contract paper is required";
    }

    if (currentStep === 6) {
      if (!formData.warehouse) nextErrors.warehouse = "Warehouse is required";
      if (!formData.joiningDate)
        nextErrors.joiningDate = "Joining date is required";
      if (!formData.employmentType)
        nextErrors.employmentType = "Employment type is required";
    }

    if (currentStep === 7) {
      if (!formData.declarationAccurate)
        nextErrors.declarationAccurate = "Required";
      if (!formData.declarationVerification)
        nextErrors.declarationVerification = "Required";
      if (!formData.declarationPolicy)
        nextErrors.declarationPolicy = "Required";
      if (!formData.declarationDate)
        nextErrors.declarationDate = "Declaration date is required";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const nextStep = () => {
    if (currentStep !== 0 && !validateStep()) return;
    if (currentStep < steps.length - 1) setCurrentStep((prev) => prev + 1);
  };

  const prevStep = () => {
    if (currentStep > 0) setCurrentStep((prev) => prev - 1);
  };

  const saveDraft = () => {
    localStorage.setItem(
      "delivery-man-enlistment-draft",
      JSON.stringify(formData)
    );
    alert("Draft saved in browser.");
  };

  const loadDraft = () => {
    const raw = localStorage.getItem("delivery-man-enlistment-draft");
    if (!raw) return alert("No draft found.");
    try {
      const parsed = JSON.parse(raw) as DeliveryManFormData;
      setFormData({ ...initialFormData, ...parsed });
      alert("Draft loaded.");
    } catch {
      alert("Draft could not be loaded.");
    }
  };

  const submit = async () => {
    if (!validateStep()) return;

    try {
      setIsSubmitting(true);

      const selectedWarehouseId = Number(formData.warehouse);
      if (!selectedWarehouseId) {
        throw new Error("Please select a valid warehouse");
      }

      const uploadedDocuments = await uploadDeliveryManDocuments({
        profilePhoto: formData.profilePhoto,
        identityFrontFile: formData.identityFrontFile,
        identityBackFile: formData.identityBackFile,
        fatherIdentityFrontFile: formData.fatherIdentityFrontFile,
        fatherIdentityBackFile: formData.fatherIdentityBackFile,
        motherIdentityFrontFile: formData.motherIdentityFrontFile,
        motherIdentityBackFile: formData.motherIdentityBackFile,
        bankChequeFile: formData.bankChequeFile,
        bondDocumentFile: formData.bondDocumentFile,
        contractPaperFile: formData.contractPaperFile,
        signatureFile: formData.signatureFile,
        references: formData.references,
      });

      const payload = {
        warehouseId: selectedWarehouseId,
        employeeCode: formData.employeeCode || "",

        fullName: formData.fullName,
        phone: formData.mobileNumber,
        alternatePhone: formData.alternateMobileNumber || "",
        email: formData.email || "",
        password: formData.password,
        dateOfBirth: formData.dateOfBirth || "",
        gender: formData.gender || "",

        presentAddress: formData.presentAddress,
        permanentAddress: formData.permanentAddress,

        emergencyContactName: formData.emergencyContactName || "",
        emergencyContactPhone: formData.emergencyContactNumber || "",
        emergencyContactRelation: formData.emergencyContactRelation || "",

        identityType: formData.identityType,
        identityNumber: formData.identityNumber,
        passportExpiryDate: formData.passportExpiryDate || "",

        fatherName: formData.fatherName,
        fatherIdentityType: formData.fatherIdentityType || "NID",
        fatherIdentityNumber: formData.fatherIdentityNumber || "",

        motherName: formData.motherName,
        motherIdentityType: formData.motherIdentityType || "NID",
        motherIdentityNumber: formData.motherIdentityNumber || "",

        bankName: formData.bankName || "",
        bankAccountName: formData.accountHolderName || "",
        bankAccountNumber: formData.accountNumber || "",
        bankChequeNumber: formData.chequeNumber || "",

        bondAmount: formData.bondAmount || "",
        bondSignedAt: formData.bondSignedDate || "",
        bondExpiryDate: formData.bondExpiryDate || "",

        contractSignedAt: formData.contractSignedDate || "",
        contractStartDate: formData.contractStartDate || "",
        contractEndDate: formData.contractEndDate || "",
        contractStatus: formData.contractStatus || "",

        joiningDate: formData.joiningDate,
        status: "PENDING",
        applicationStatus: "SUBMITTED",
        assignedById: null,
        note: formData.notes || "",

        references: formData.references.map((ref) => ({
          name: ref.name,
          phone: ref.phone,
          relation: ref.relation,
          address: ref.address,
          occupation: ref.occupation,
          identityType: ref.identityType,
          identityNumber: ref.identityNumber,
        })),

        documents: uploadedDocuments,
      };

      const res = await fetch("/api/delivery-men", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const text = await res.text();

      let data: any;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Save API did not return valid JSON");
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to save delivery man data");
      }

      console.log("Saved successfully:", data);
      setSubmitted(true);
    } catch (error) {
      console.error("SUBMIT ERROR:", error);
      alert(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-3xl border border-border bg-card p-10 text-card-foreground shadow-sm">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
            ✓
          </div>
          <h2 className="rubik-bold text-2xl">Application Submitted</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Delivery man enlistment data has been uploaded and saved successfully.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-sm">
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="rubik-semibold">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => {
            const active = index === currentStep;
            const done = index < currentStep;
            return (
              <div
                key={step}
                className={`rounded-2xl border p-3 transition ${
                  active
                    ? "border-primary bg-accent text-accent-foreground"
                    : done
                    ? "border-border bg-muted"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                        ? "bg-primary text-primary-foreground"
                        : "bg-background text-foreground border border-border"
                    }`}
                  >
                    {done ? "✓" : index + 1}
                  </div>
                  <span className="rubik-medium text-sm">{step}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={saveDraft}
            className="btn-outline w-full rounded-xl px-4 py-3 text-sm font-medium"
          >
            Save Draft
          </button>
          <button
            type="button"
            onClick={loadDraft}
            className="btn-outline w-full rounded-xl px-4 py-3 text-sm font-medium"
          >
            Load Draft
          </button>
        </div> */}
      </aside>

      <section className="rounded-3xl border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
        {currentStep === 0 && (
          <Section
            title="Document OCR Auto Fill"
            description="Upload the applicant's NID or Passport front copy. The form will try to auto-detect visible text and fill matching fields."
          >
            <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
              <div className="rounded-2xl border border-border bg-background p-5">
                <FileUpload
                  label="Upload NID / Passport Front Copy"
                  file={formData.identityFrontFile}
                  accept=".jpg,.jpeg,.png,.webp"
                  onChange={handleOcrDocumentUpload}
                />
                <div className="mt-4 rounded-2xl border border-border bg-muted p-4">
                  <p className="text-sm rubik-medium">OCR Status</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isReadingDoc
                      ? ocrMessage
                      : ocrMessage || "No document processed yet."}
                  </p>
                </div>
                {rawExtractedText ? (
                  <div className="mt-4">
                    <label className="mb-2 block text-sm font-medium">
                      Extracted Text Preview
                    </label>
                    <textarea
                      readOnly
                      value={rawExtractedText}
                      rows={10}
                      className="input-theme w-full rounded-2xl border bg-background px-4 py-3 text-xs outline-none"
                    />
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-border bg-background p-5">
                <h3 className="rubik-semibold text-lg">Detected Information</h3>
                <div className="mt-4 space-y-3">
                  <InfoRow
                    label="Document Type"
                    value={parsedDoc?.documentType || "—"}
                  />
                  <InfoRow
                    label="Full Name"
                    value={parsedDoc?.fullName || "—"}
                  />
                  <InfoRow
                    label="Identity Number"
                    value={parsedDoc?.identityNumber || "—"}
                  />
                  <InfoRow
                    label="Date of Birth"
                    value={parsedDoc?.dateOfBirth || "—"}
                  />
                  <InfoRow
                    label="Passport Expiry"
                    value={parsedDoc?.passportExpiryDate || "—"}
                  />
                </div>

                {parsedDoc ? (
                  <button
                    type="button"
                    onClick={() => applyDetectedValues(parsedDoc)}
                    className="btn-primary mt-5 w-full rounded-xl px-4 py-3 text-sm font-medium"
                  >
                    Use Detected Information
                  </button>
                ) : null}

                <p className="mt-4 text-xs text-muted-foreground">
                  Detected values are approximate. Please review everything before
                  submit.
                </p>
              </div>
            </div>
          </Section>
        )}

        {currentStep === 1 && (
          <Section
            title="Personal Information"
            description="Basic information and emergency contact."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Input
                label="Full Name *"
                value={formData.fullName}
                onChange={(v) => updateField("fullName", v)}
                error={errors.fullName}
              />
              <Input
                label="Mobile Number *"
                value={formData.mobileNumber}
                onChange={(v) => updateField("mobileNumber", v)}
                error={errors.mobileNumber}
              />
              <Input
                label="Email Address"
                type="email"
                value={formData.email}
                onChange={(v) => updateField("email", v)}
              />
              <Input
                label="Password *"
                type="password"
                value={formData.password}
                onChange={(v) => updateField("password", v)}
                error={errors.password}
                placeholder="Create a password for delivery man account"
              />
              <Input
                label="Date of Birth *"
                type="date"
                value={formData.dateOfBirth}
                onChange={(v) => updateField("dateOfBirth", v)}
                error={errors.dateOfBirth}
              />
              <Select
                label="Gender *"
                value={formData.gender}
                onChange={(v) =>
                  updateField("gender", v as DeliveryManFormData["gender"])
                }
                error={errors.gender}
                options={[
                  { label: "Select gender", value: "" },
                  { label: "Male", value: "MALE" },
                  { label: "Female", value: "FEMALE" },
                  { label: "Other", value: "OTHER" },
                ]}
              />
              <Input
                label="Blood Group"
                value={formData.bloodGroup}
                onChange={(v) => updateField("bloodGroup", v)}
              />
              <Input
                label="Marital Status"
                value={formData.maritalStatus}
                onChange={(v) => updateField("maritalStatus", v)}
              />
            </div>

            <div className="mt-5">
              <FileUpload
                label="Profile Photo"
                file={formData.profilePhoto}
                accept=".jpg,.jpeg,.png,.webp"
                onChange={(e) => handleFileChange(e, "profilePhoto")}
              />
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <Textarea
                label="Present Address *"
                value={formData.presentAddress}
                onChange={(v) => updateField("presentAddress", v)}
                error={errors.presentAddress}
              />
              <Textarea
                label="Permanent Address *"
                value={formData.permanentAddress}
                onChange={(v) => updateField("permanentAddress", v)}
                error={errors.permanentAddress}
              />
            </div>

            <div className="mt-5 grid gap-5 md:grid-cols-3">
              <Input
                label="Emergency Contact Name *"
                value={formData.emergencyContactName}
                onChange={(v) => updateField("emergencyContactName", v)}
                error={errors.emergencyContactName}
              />
              <Input
                label="Emergency Contact Number *"
                value={formData.emergencyContactNumber}
                onChange={(v) => updateField("emergencyContactNumber", v)}
                error={errors.emergencyContactNumber}
              />
              <Input
                label="Emergency Contact Relation *"
                value={formData.emergencyContactRelation}
                onChange={(v) => updateField("emergencyContactRelation", v)}
                error={errors.emergencyContactRelation}
              />
            </div>
          </Section>
        )}

        {currentStep === 2 && (
          <Section
            title="Identity Verification"
            description="Applicant identity information and uploads."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Select
                label="Identity Type *"
                value={formData.identityType}
                onChange={(v) =>
                  updateField("identityType", v as DeliveryManFormData["identityType"])
                }
                options={[
                  { label: "NID", value: "NID" },
                  { label: "Passport", value: "PASSPORT" },
                ]}
              />
              <Input
                label="Identity Number *"
                value={formData.identityNumber}
                onChange={(v) => updateField("identityNumber", v)}
                error={errors.identityNumber}
              />
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <FileUpload
                label="Identity Front Copy *"
                file={formData.identityFrontFile}
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => handleFileChange(e, "identityFrontFile")}
                error={errors.identityFrontFile}
              />
              <FileUpload
                label="Identity Back Copy"
                file={formData.identityBackFile}
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={(e) => handleFileChange(e, "identityBackFile")}
              />
            </div>
            {formData.identityType === "PASSPORT" ? (
              <div className="mt-5 max-w-md">
                <Input
                  label="Passport Expiry Date *"
                  type="date"
                  value={formData.passportExpiryDate}
                  onChange={(v) => updateField("passportExpiryDate", v)}
                  error={errors.passportExpiryDate}
                />
              </div>
            ) : null}
          </Section>
        )}

        {currentStep === 3 && (
          <Section
            title="Family Information"
            description="Father and mother identity data."
          >
            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="Father Information">
                <div className="grid gap-4">
                  <Input
                    label="Father's Name *"
                    value={formData.fatherName}
                    onChange={(v) => updateField("fatherName", v)}
                    error={errors.fatherName}
                  />
                  <Input
                    label="Father's Mobile Number"
                    value={formData.fatherMobileNumber}
                    onChange={(v) => updateField("fatherMobileNumber", v)}
                  />
                  <Select
                    label="Father's Identity Type"
                    value={formData.fatherIdentityType}
                    onChange={(v) =>
                      updateField(
                        "fatherIdentityType",
                        v as DeliveryManFormData["fatherIdentityType"]
                      )
                    }
                    options={[
                      { label: "NID", value: "NID" },
                      { label: "Passport", value: "PASSPORT" },
                    ]}
                  />
                  <Input
                    label="Father's Identity Number *"
                    value={formData.fatherIdentityNumber}
                    onChange={(v) => updateField("fatherIdentityNumber", v)}
                    error={errors.fatherIdentityNumber}
                  />
                  <FileUpload
                    label="Father's Identity Front Copy *"
                    file={formData.fatherIdentityFrontFile}
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) =>
                      handleFileChange(e, "fatherIdentityFrontFile")
                    }
                    error={errors.fatherIdentityFrontFile}
                  />
                  <FileUpload
                    label="Father's Identity Back Copy"
                    file={formData.fatherIdentityBackFile}
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) =>
                      handleFileChange(e, "fatherIdentityBackFile")
                    }
                  />
                </div>
              </Card>

              <Card title="Mother Information">
                <div className="grid gap-4">
                  <Input
                    label="Mother's Name *"
                    value={formData.motherName}
                    onChange={(v) => updateField("motherName", v)}
                    error={errors.motherName}
                  />
                  <Input
                    label="Mother's Mobile Number"
                    value={formData.motherMobileNumber}
                    onChange={(v) => updateField("motherMobileNumber", v)}
                  />
                  <Select
                    label="Mother's Identity Type"
                    value={formData.motherIdentityType}
                    onChange={(v) =>
                      updateField(
                        "motherIdentityType",
                        v as DeliveryManFormData["motherIdentityType"]
                      )
                    }
                    options={[
                      { label: "NID", value: "NID" },
                      { label: "Passport", value: "PASSPORT" },
                    ]}
                  />
                  <Input
                    label="Mother's Identity Number *"
                    value={formData.motherIdentityNumber}
                    onChange={(v) => updateField("motherIdentityNumber", v)}
                    error={errors.motherIdentityNumber}
                  />
                  <FileUpload
                    label="Mother's Identity Front Copy *"
                    file={formData.motherIdentityFrontFile}
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) =>
                      handleFileChange(e, "motherIdentityFrontFile")
                    }
                    error={errors.motherIdentityFrontFile}
                  />
                  <FileUpload
                    label="Mother's Identity Back Copy"
                    file={formData.motherIdentityBackFile}
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) =>
                      handleFileChange(e, "motherIdentityBackFile")
                    }
                  />
                </div>
              </Card>
            </div>
          </Section>
        )}

        {currentStep === 4 && (
          <Section
            title="Reference Details"
            description="Minimum 2 references required."
            action={
              <button
                type="button"
                onClick={addReference}
                className="btn-outline rounded-xl px-4 py-2 text-sm font-medium"
              >
                + Add Reference
              </button>
            }
          >
            <div className="space-y-6">
              {formData.references.map((reference, index) => (
                <Card
                  key={index}
                  title={`Reference ${index + 1}`}
                  right={
                    formData.references.length > 2 ? (
                      <button
                        type="button"
                        onClick={() => removeReference(index)}
                        className="text-sm font-medium text-destructive"
                      >
                        Remove
                      </button>
                    ) : null
                  }
                >
                  <div className="grid gap-5 md:grid-cols-2">
                    <Input
                      label="Full Name *"
                      value={reference.name}
                      onChange={(v) => updateReference(index, "name", v)}
                      error={errors[`references.${index}.name`]}
                    />
                    <Input
                      label="Mobile Number *"
                      value={reference.phone}
                      onChange={(v) => updateReference(index, "phone", v)}
                      error={errors[`references.${index}.phone`]}
                    />
                    <Input
                      label="Relation *"
                      value={reference.relation}
                      onChange={(v) => updateReference(index, "relation", v)}
                      error={errors[`references.${index}.relation`]}
                    />
                    <Input
                      label="Occupation"
                      value={reference.occupation}
                      onChange={(v) => updateReference(index, "occupation", v)}
                    />
                    <Textarea
                      label="Address *"
                      value={reference.address}
                      onChange={(v) => updateReference(index, "address", v)}
                      error={errors[`references.${index}.address`]}
                    />
                    <div className="grid gap-5">
                      <Select
                        label="Identity Type *"
                        value={reference.identityType}
                        onChange={(v) =>
                          updateReference(
                            index,
                            "identityType",
                            v as ReferencePerson["identityType"]
                          )
                        }
                        options={[
                          { label: "NID", value: "NID" },
                          { label: "Passport", value: "PASSPORT" },
                        ]}
                      />
                      <Input
                        label="Identity Number *"
                        value={reference.identityNumber}
                        onChange={(v) =>
                          updateReference(index, "identityNumber", v)
                        }
                        error={errors[`references.${index}.identityNumber`]}
                      />
                    </div>
                  </div>
                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    <FileUpload
                      label="Identity Front Copy *"
                      file={reference.identityFrontFile}
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      onChange={(e) =>
                        handleReferenceFileChange(e, index, "identityFrontFile")
                      }
                      error={errors[`references.${index}.identityFrontFile`]}
                    />
                    <FileUpload
                      label="Identity Back Copy"
                      file={reference.identityBackFile}
                      accept=".jpg,.jpeg,.png,.webp,.pdf"
                      onChange={(e) =>
                        handleReferenceFileChange(e, index, "identityBackFile")
                      }
                    />
                  </div>
                </Card>
              ))}
            </div>
          </Section>
        )}

        {currentStep === 5 && (
          <Section
            title="Bank & Legal Documents"
            description="Cheque, bond and contract paper."
          >
            <div className="grid gap-6 xl:grid-cols-2">
              <Card title="Bank Information">
                <div className="grid gap-4">
                  <Input
                    label="Bank Name *"
                    value={formData.bankName}
                    onChange={(v) => updateField("bankName", v)}
                    error={errors.bankName}
                  />
                  <Input
                    label="Account Holder Name"
                    value={formData.accountHolderName}
                    onChange={(v) => updateField("accountHolderName", v)}
                  />
                  <Input
                    label="Account Number"
                    value={formData.accountNumber}
                    onChange={(v) => updateField("accountNumber", v)}
                  />
                  <Input
                    label="Cheque Number"
                    value={formData.chequeNumber}
                    onChange={(v) => updateField("chequeNumber", v)}
                  />
                  <FileUpload
                    label="Bank Cheque Upload *"
                    file={formData.bankChequeFile}
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => handleFileChange(e, "bankChequeFile")}
                    error={errors.bankChequeFile}
                  />
                </div>
              </Card>
              <Card title="Bond Information">
                <div className="grid gap-4">
                  <Input
                    label="Bond Amount"
                    value={formData.bondAmount}
                    onChange={(v) => updateField("bondAmount", v)}
                  />
                  <Input
                    label="Bond Signed Date"
                    type="date"
                    value={formData.bondSignedDate}
                    onChange={(v) => updateField("bondSignedDate", v)}
                  />
                  <Input
                    label="Bond Expiry Date"
                    type="date"
                    value={formData.bondExpiryDate}
                    onChange={(v) => updateField("bondExpiryDate", v)}
                  />
                  <FileUpload
                    label="Bond Document Upload *"
                    file={formData.bondDocumentFile}
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => handleFileChange(e, "bondDocumentFile")}
                    error={errors.bondDocumentFile}
                  />
                </div>
              </Card>
            </div>
            <div className="mt-6">
              <Card title="Contract / Contact Paper">
                <div className="grid gap-5 md:grid-cols-2">
                  <Input
                    label="Contract Signed Date"
                    type="date"
                    value={formData.contractSignedDate}
                    onChange={(v) => updateField("contractSignedDate", v)}
                  />
                  <Input
                    label="Contract Start Date"
                    type="date"
                    value={formData.contractStartDate}
                    onChange={(v) => updateField("contractStartDate", v)}
                  />
                  <Input
                    label="Contract End Date"
                    type="date"
                    value={formData.contractEndDate}
                    onChange={(v) => updateField("contractEndDate", v)}
                  />
                  <Input
                    label="Contract Status"
                    value={formData.contractStatus}
                    onChange={(v) => updateField("contractStatus", v)}
                  />
                </div>
                <div className="mt-5 max-w-xl">
                  <FileUpload
                    label="Contract Paper Upload *"
                    file={formData.contractPaperFile}
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => handleFileChange(e, "contractPaperFile")}
                    error={errors.contractPaperFile}
                  />
                </div>
              </Card>
            </div>
          </Section>
        )}

        {currentStep === 6 && (
          <Section
            title="Warehouse Assignment"
            description="Joining and assignment information."
          >
            <div className="grid gap-5 md:grid-cols-2">
              <Select
                label="Warehouse *"
                value={formData.warehouse}
                onChange={(v) => updateField("warehouse", v)}
                error={errors.warehouse}
                options={[
                  {
                    label: isLoadingWarehouses
                      ? "Loading warehouses..."
                      : "Select warehouse",
                    value: "",
                  },
                  ...warehouses.map((w) => ({
                    label: w.code ? `${w.name} (${w.code})` : w.name,
                    value: String(w.id),
                  })),
                ]}
              />
              <Input
                label="Employee / Rider Code"
                value={formData.employeeCode}
                onChange={(v) => updateField("employeeCode", v)}
              />
              <Input
                label="Joining Date *"
                type="date"
                value={formData.joiningDate}
                onChange={(v) => updateField("joiningDate", v)}
                error={errors.joiningDate}
              />
              <Select
                label="Employment Type *"
                value={formData.employmentType}
                onChange={(v) =>
                  updateField(
                    "employmentType",
                    v as DeliveryManFormData["employmentType"]
                  )
                }
                error={errors.employmentType}
                options={[
                  { label: "Select employment type", value: "" },
                  { label: "Full-time", value: "FULL_TIME" },
                  { label: "Part-time", value: "PART_TIME" },
                  { label: "Contractual", value: "CONTRACTUAL" },
                ]}
              />
              <Input
                label="Delivery Zone / Area"
                value={formData.deliveryZone}
                onChange={(v) => updateField("deliveryZone", v)}
              />
              <Input
                label="Assigned By"
                value={formData.assignedBy}
                onChange={(v) => updateField("assignedBy", v)}
              />
            </div>

            {warehouseLoadError ? (
              <p className="mt-3 text-sm text-destructive">{warehouseLoadError}</p>
            ) : null}

            <div className="mt-5">
              <Textarea
                label="Notes"
                value={formData.notes}
                onChange={(v) => updateField("notes", v)}
              />
            </div>
          </Section>
        )}

        {currentStep === 7 && (
          <Section
            title="Review & Submit"
            description="Review all information and confirm declarations."
          >
            <div className="rounded-2xl border border-border bg-background p-5">
              <h3 className="rubik-semibold text-lg">Application Summary</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <InfoRow label="Full Name" value={formData.fullName || "—"} />
                <InfoRow
                  label="Mobile Number"
                  value={formData.mobileNumber || "—"}
                />
                <InfoRow
                  label="Identity Type"
                  value={formData.identityType || "—"}
                />
                <InfoRow
                  label="Identity Number"
                  value={formData.identityNumber || "—"}
                />
                <InfoRow
                  label="Date of Birth"
                  value={formData.dateOfBirth || "—"}
                />
                <InfoRow label="Warehouse" value={selectedWarehouseLabel} />
                <InfoRow
                  label="Joining Date"
                  value={formData.joiningDate || "—"}
                />
                <InfoRow
                  label="Employment Type"
                  value={formData.employmentType || "—"}
                />
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-background p-5">
              <h3 className="rubik-semibold text-lg">Declaration</h3>
              <div className="mt-4 space-y-3">
                <Checkbox
                  label="I confirm that all information is accurate. *"
                  checked={formData.declarationAccurate}
                  onChange={(checked) =>
                    updateField("declarationAccurate", checked)
                  }
                  error={errors.declarationAccurate}
                />
                <Checkbox
                  label="I authorize identity and reference verification. *"
                  checked={formData.declarationVerification}
                  onChange={(checked) =>
                    updateField("declarationVerification", checked)
                  }
                  error={errors.declarationVerification}
                />
                <Checkbox
                  label="I accept the company policy. *"
                  checked={formData.declarationPolicy}
                  onChange={(checked) =>
                    updateField("declarationPolicy", checked)
                  }
                  error={errors.declarationPolicy}
                />
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <Input
                  label="Declaration Date *"
                  type="date"
                  value={formData.declarationDate}
                  onChange={(v) => updateField("declarationDate", v)}
                  error={errors.declarationDate}
                />
              </div>
            </div>
          </Section>
        )}

        <div className="mt-8 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={prevStep}
            disabled={currentStep === 0 || isSubmitting}
            className="btn-outline rounded-xl px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          {currentStep < steps.length - 1 ? (
            <button
              type="button"
              onClick={nextStep}
              disabled={isSubmitting}
              className="btn-primary rounded-xl px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next Step
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={isSubmitting}
              className="btn-primary rounded-xl px-5 py-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Submitting..." : "Submit Application"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="rubik-bold text-2xl">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Card({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-background p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="rubik-semibold text-lg">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm rubik-semibold">{value}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm rubik-medium">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`input-theme w-full rounded-xl border bg-background px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-ring ${
          error ? "border-destructive" : ""
        }`}
      />
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function Textarea({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm rubik-medium">{label}</label>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input-theme w-full rounded-xl border bg-background px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-ring ${
          error ? "border-destructive" : ""
        }`}
      />
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  error?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm rubik-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`input-theme w-full rounded-xl border bg-background px-4 py-3 text-sm outline-none transition focus:ring-2 focus:ring-ring ${
          error ? "border-destructive" : ""
        }`}
      >
        {options.map((option) => (
          <option key={`${option.label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function FileUpload({
  label,
  file,
  onChange,
  accept,
  error,
}: {
  label: string;
  file: File | null;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  accept?: string;
  error?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (file && file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  return (
    <div>
      <label className="mb-2 block text-sm rubik-medium">{label}</label>
      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-8 text-center transition ${
          error
            ? "border-destructive bg-muted"
            : "border-border bg-muted hover:bg-accent"
        }`}
      >
        {previewUrl ? (
          <div className="mb-3 w-full">
            <img
              src={previewUrl}
              alt="Preview"
              className="h-full w-full object-cover rounded-lg border border-border"
            />
          </div>
        ) : (
          <div className="mb-3 w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <span className="text-primary text-xl">📄</span>
          </div>
        )}
        <span className="text-sm rubik-medium">
          {file ? file.name : "Click to upload file"}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">
          JPG, PNG, WEBP, PDF
        </span>
        <input
          type="file"
          className="hidden"
          accept={accept}
          onChange={onChange}
        />
      </label>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  error,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}) {
  return (
    <div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-border"
        />
        <span className="text-sm">{label}</span>
      </label>
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
