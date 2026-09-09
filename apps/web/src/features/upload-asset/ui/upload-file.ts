export function uploadFile({
  file,
  headers,
  onProgress,
  url,
}: {
  file: File;
  headers: Record<string, string>;
  onProgress: (progress: number) => void;
  url: string;
}) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);

    for (const [name, value] of Object.entries(headers)) {
      request.setRequestHeader(name, value);
    }

    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`Object storage returned HTTP ${request.status}`));
      }
    });
    request.addEventListener("error", () => {
      reject(new Error("The object storage upload failed"));
    });
    request.send(file);
  });
}
