import { createHash, timingSafeEqual } from "node:crypto"

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
