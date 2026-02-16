import { isIOS } from '../lib/config';

/**
 * Handles file downloads with a specific strategy for iOS PWAs to avoid "lock up" in previews.
 */
export async function downloadFile(fileUrl: string, fileName: string) {
  // Convert /api/file/{key} to /api/file/{key}/{filename} for better recognition
  const baseUrl = fileUrl.split('?')[0];
  const pathUrl = baseUrl.endsWith('/') ? baseUrl + fileName : baseUrl + '/' + fileName;
  const absoluteUrl = new URL(pathUrl, window.location.origin).href;

  const isStandalone = (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone);

  // iOS PWA Navigation Strategy
  if (isIOS && isStandalone) {
    // Open a new window immediately to avoid the popup blocker
    const popup = window.open('about:blank', '_blank');
    if (popup) {
      popup.document.write(`
                <html>
                <head><title>Downloading...</title><meta name="viewport" content="width=device-width, initial-scale=1"></head>
                <body style="background:#313338;color:#dbdee1;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;font-family:sans-serif;text-align:center;">
                    <div id="status">Preparing download...<br><span style="font-size:0.8em;color:#949BA4;">${fileName}</span></div>
                </body>
                </html>
            `);

      try {
        const response = await fetch(absoluteUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onload = function () {
          const link = popup.document.createElement('a');
          link.href = reader.result as string;
          link.download = fileName;
          popup.document.body.appendChild(link);
          link.click();

          const statusEl = popup.document.getElementById('status');
          if (statusEl) {
            statusEl.innerHTML = `
                        <div style="padding:20px; max-width: 300px;">
                            <div style="font-size:1.2em;margin-bottom:10px;font-weight:bold;color:white;">Download Ready</div>
                            <div style="color:#949BA4;margin-bottom:20px;font-size:0.9em;word-break:break-all;">${fileName}</div>
                            
                            <div style="background:#2b2d31;padding:15px;border-radius:8px;text-align:left;border:1px solid #404249;">
                                <p style="margin:0 0 10px 0;font-weight:bold;color:#dbdee1;">Instructions:</p>
                                <ul style="margin:0;padding-left:15px;font-size:0.85em;line-height:1.6;list-style-type: disc;">
                                    <li>Tap <b>"Download"</b> if you see a prompt.</li>
                                    <li>If the file opens directly, tap the <b>Share</b> icon and select <b>"Save to Files"</b>.</li>
                                    <li>Use the <b>"Done"</b> button in the top corner to return to the app.</li>
                                </ul>
                            </div>
                        </div>
                    `;
          }
        };
        reader.readAsDataURL(blob);
        return;
      } catch (err) {
        console.error("Download failed:", err);
        const statusEl = popup.document.getElementById('status');
        if (statusEl) {
          statusEl.innerHTML = 'Download failed. Please try again.';
        }
      }
    } else {
      // Fallback to the x-safari- scheme if popup was blocked
      if (absoluteUrl.startsWith('https://')) {
        window.location.href = absoluteUrl.replace('https://', 'x-safari-https://');
        return;
      }
    }
  }

  // Standard download for desktop and mobile web
  const a = document.createElement('a');
  a.href = pathUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
