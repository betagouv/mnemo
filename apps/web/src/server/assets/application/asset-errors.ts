export class AssetAccessDeniedError extends Error {
  override name = "AssetAccessDeniedError";
}

export class UnsupportedAssetFileError extends Error {
  override name = "UnsupportedAssetFileError";
}

export class AssetUploadVerificationError extends Error {
  override name = "AssetUploadVerificationError";
}
