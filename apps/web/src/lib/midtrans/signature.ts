import { createHash, timingSafeEqual } from "node:crypto"

// No `server-only` guard here on purpose: this is a pure crypto helper with no
// embedded secret (the server key is passed in by the caller), and the guard
// would break `node --test`. The only server secret lives in client.ts/service.ts,
// which do carry `server-only`.
// Midtrans notification signature: sha512(order_id + status_code + gross_amount + serverKey)
export function verifyMidtransSignature(
  input: {
    order_id: string
    status_code: string
    gross_amount: string
    signature_key: string
  },
  serverKey: string
): boolean {
  const expected = createHash("sha512")
    .update(input.order_id + input.status_code + input.gross_amount + serverKey)
    .digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(input.signature_key)
  return a.length === b.length && timingSafeEqual(a, b)
}
