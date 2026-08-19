export interface ImageInput {
  imageBase64: string;
  mimeType: string;
  documentType: string;
}

export interface ImageValidationConfig {
  maxImageSizeBytes: number;
  allowedMimeTypes: string[];
}

export interface ImageValidationError {
  code: "unsupported_mime_type" | "image_too_large" | "missing_document_type" | "missing_image";
  message: string;
}

export function validateImageInput(
  input: Partial<ImageInput> | undefined,
  config: ImageValidationConfig,
): ImageValidationError | null {
  if (!input?.documentType) {
    return { code: "missing_document_type", message: "document_type is required" };
  }

  if (!input.imageBase64 || !input.mimeType) {
    return { code: "missing_image", message: "An image (multipart file or imageBase64+mimeType) is required" };
  }

  if (!config.allowedMimeTypes.includes(input.mimeType)) {
    return {
      code: "unsupported_mime_type",
      message: `Unsupported mime type "${input.mimeType}". Allowed: ${config.allowedMimeTypes.join(", ")}`,
    };
  }

  const sizeBytes = Buffer.byteLength(input.imageBase64, "base64");
  if (sizeBytes > config.maxImageSizeBytes) {
    return {
      code: "image_too_large",
      message: `Image size ${sizeBytes} bytes exceeds the maximum of ${config.maxImageSizeBytes} bytes`,
    };
  }

  return null;
}
