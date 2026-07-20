export const DEFAULT_UPLOAD_MEDIA_TYPE = "application/octet-stream";

export function canonicalUploadMediaType(mediaType: string): string {
  const normalized = mediaType.trim().toLowerCase();
  return normalized.length === 0 ? DEFAULT_UPLOAD_MEDIA_TYPE : normalized;
}

export type UploadRequestBindingInput = Readonly<{
  operationId: string;
  fileSha256: string;
  fileName: string;
  mediaType: string;
}>;

export function canonicalUploadRequestBinding(
  input: UploadRequestBindingInput,
) {
  return {
    schemaVersion: "1" as const,
    operationId: input.operationId,
    fileSha256: input.fileSha256,
    fileName: input.fileName,
    mediaType: canonicalUploadMediaType(input.mediaType),
  };
}
