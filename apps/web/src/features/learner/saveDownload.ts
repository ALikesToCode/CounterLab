import type { AuthenticatedDownload } from "../../api";

export function saveAuthenticatedDownload(
  download: AuthenticatedDownload,
): void {
  const url = URL.createObjectURL(download.blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = download.fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
