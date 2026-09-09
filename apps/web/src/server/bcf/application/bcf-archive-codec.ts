import type {
  BcfArchiveDecodeResult,
  BcfArchiveExportInput,
} from "@mnemo/bcf-adapter";

export interface BcfArchiveCodec {
  decode(bytes: Uint8Array): Promise<BcfArchiveDecodeResult>;
  encode(input: BcfArchiveExportInput): Promise<Uint8Array>;
}
