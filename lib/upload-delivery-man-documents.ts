import { uploadFile } from "./upload-file";

export type UploadedDocument = {
  type: string;
  fileUrl: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  referenceIndex?: number;
};

type ReferenceInput = {
  identityFrontFile?: File | null;
  identityBackFile?: File | null;
};

type UploadParams = {
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

  references?: ReferenceInput[];
};

export async function uploadDeliveryManDocuments(
  params: UploadParams
): Promise<UploadedDocument[]> {
  const documents: UploadedDocument[] = [];

  async function handleUpload(
    type: string,
    file?: File | null,
    extra?: Partial<UploadedDocument>
  ) {
    if (!file) return;

    const fileUrl = await uploadFile(file, "/api/upload/delivery-man-documents");

    documents.push({
      type,
      fileUrl,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
      ...extra,
    });
  }

  await handleUpload("PROFILE_PHOTO", params.profilePhoto);

  await handleUpload("IDENTITY_FRONT", params.identityFrontFile);
  await handleUpload("IDENTITY_BACK", params.identityBackFile);

  await handleUpload("FATHER_IDENTITY_FRONT", params.fatherIdentityFrontFile);
  await handleUpload("FATHER_IDENTITY_BACK", params.fatherIdentityBackFile);

  await handleUpload("MOTHER_IDENTITY_FRONT", params.motherIdentityFrontFile);
  await handleUpload("MOTHER_IDENTITY_BACK", params.motherIdentityBackFile);

  await handleUpload("BANK_CHEQUE", params.bankChequeFile);
  await handleUpload("BOND", params.bondDocumentFile);
  await handleUpload("CONTRACT_PAPER", params.contractPaperFile);
  await handleUpload("SIGNATURE", params.signatureFile);

  if (params.references?.length) {
    for (let i = 0; i < params.references.length; i++) {
      const ref = params.references[i];

      await handleUpload("REFERENCE_IDENTITY_FRONT", ref.identityFrontFile, {
        referenceIndex: i,
      });

      await handleUpload("REFERENCE_IDENTITY_BACK", ref.identityBackFile, {
        referenceIndex: i,
      });
    }
  }

  return documents;
}
