import { test } from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { verifyMidtransSignature } from "./signature.ts"

const serverKey = "SB-Mid-server-TEST"
const order_id = "sub-abc123"
const status_code = "200"
const gross_amount = "99000.00"
const valid = createHash("sha512")
  .update(order_id + status_code + gross_amount + serverKey)
  .digest("hex")

test("accepts a correct signature", () => {
  assert.equal(
    verifyMidtransSignature(
      { order_id, status_code, gross_amount, signature_key: valid },
      serverKey
    ),
    true
  )
})

test("rejects a tampered signature", () => {
  assert.equal(
    verifyMidtransSignature(
      { order_id, status_code, gross_amount, signature_key: "deadbeef" },
      serverKey
    ),
    false
  )
})

test("rejects when amount differs", () => {
  assert.equal(
    verifyMidtransSignature(
      { order_id, status_code, gross_amount: "1.00", signature_key: valid },
      serverKey
    ),
    false
  )
})
