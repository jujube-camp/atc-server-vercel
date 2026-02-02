import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

// Apple's public keys endpoint
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';

// Create JWKS client with caching
const client = jwksClient({
  jwksUri: APPLE_KEYS_URL,
  cache: true,
  cacheMaxAge: 24 * 60 * 60 * 1000, // 24 hours
  rateLimit: true,
  jwksRequestsPerMinute: 10,
});

/**
 * Get Apple's public key for token verification
 */
function getKey(header: any, callback: any) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Verify Apple identity token and extract payload
 * @param identityToken - Apple identity token (JWT)
 * @param clientId - Apple client ID (bundle ID)
 * @returns Decoded token payload
 */
export async function verifyAppleToken(
  identityToken: string,
  clientId: string
): Promise<any> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      identityToken,
      getKey,
      {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: clientId,
        clockTolerance: 30, // 30 seconds tolerance for clock skew
      },
      (err, decoded) => {
        if (err) {
          return reject(new Error(`Apple token verification failed: ${err.message}`));
        }
        resolve(decoded);
      }
    );
  });
}

/**
 * Extract user information from Apple token payload
 */
export interface AppleUserInfo {
  sub: string; // Apple user ID
  email?: string;
  emailVerified?: boolean;
}

export function extractAppleUserInfo(payload: any): AppleUserInfo {
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === 'true' || payload.email_verified === true,
  };
}

