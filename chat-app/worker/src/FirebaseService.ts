export class FirebaseService {
  private projectId: string;
  private clientEmail: string;
  private privateKey: string;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor(projectId: string, clientEmail: string, privateKey: string) {
    this.projectId = projectId;
    this.clientEmail = clientEmail;
    this.privateKey = privateKey;
  }

  private async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && now < this.tokenExpiry) {
      return this.accessToken;
    }

    const header = {
      alg: "RS256",
      typ: "JWT",
    };

    const payload = {
      iss: this.clientEmail,
      sub: this.clientEmail,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
    };

    const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "");
    const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "");
    const unsignedToken = `${encodedHeader}.${encodedPayload}`;

    const signature = await this.sign(unsignedToken);
    const jwt = `${unsignedToken}.${signature}`;

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    const data = await response.json() as any;
    if (!data.access_token) {
      throw new Error(`Failed to get access token: ${JSON.stringify(data)}`);
    }

    this.accessToken = data.access_token;
    this.tokenExpiry = now + data.expires_in - 60;
    return this.accessToken!;
  }

  private async sign(text: string): Promise<string> {
    const pem = this.privateKey.replace(/\\n/g, "\n");
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    
    const startIndex = pem.indexOf(pemHeader);
    const endIndex = pem.indexOf(pemFooter);
    
    if (startIndex === -1 || endIndex === -1) {
      throw new Error("Invalid Private Key format: Missing BEGIN or END header");
    }

    const pemContents = pem.substring(
      startIndex + pemHeader.length,
      endIndex
    ).replace(/\s/g, "");

    // Use a more robust way to handle base64 to binary conversion in Workers
    const binaryDerString = atob(pemContents);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
      binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    const key = await crypto.subtle.importKey(
      "pkcs8",
      binaryDer.buffer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(text)
    );

    return btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");
  }

  async sendNotification(token: string, title: string, body: string, data: any = {}) {
    const accessToken = await this.getAccessToken();
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token,
            notification: {
              title,
              body,
            },
            data,
            webpush: {
              fcm_options: {
                link: data.link || "/",
              },
            },
          },
        }),
      }
    );

    if (!response.ok) {
        const error = await response.json();
        console.error("FCM Send Error:", error);
        return { success: false, error };
    }

    return { success: true };
  }
}
