import QRCode from "qrcode";

/**
 * Generate a QR code as a base64 data URL (PNG)
 * Works in Node.js server context only
 */
export async function generateQrDataUrl(data: string): Promise<string> {
  return QRCode.toDataURL(data, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: 300,
    color: { dark: "#0f0f0e", light: "#ffffff" },
  });
}

/**
 * Generate a QR code as SVG string
 * Lightweight, embeddable in HTML emails
 */
export async function generateQrSvg(data: string): Promise<string> {
  return QRCode.toString(data, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 1,
    color: { dark: "#0f0f0e", light: "#ffffff" },
  });
}
