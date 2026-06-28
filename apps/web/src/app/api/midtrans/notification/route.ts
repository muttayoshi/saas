import { NextResponse } from "next/server"
import { verifyMidtransSignature } from "@/lib/midtrans/signature"
import { settleOrder } from "@/app/dashboard/subscription/actions"

export async function POST(request: Request) {
  const serverKey = process.env.MIDTRANS_SERVER_KEY
  if (!serverKey) return NextResponse.json({ ok: false }, { status: 500 })

  let body: {
    order_id?: string
    status_code?: string
    gross_amount?: string
    signature_key?: string
    transaction_status?: string
    transaction_id?: string
    payment_type?: string
    fraud_status?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: "bad json" }, { status: 400 })
  }

  const { order_id, status_code, gross_amount, signature_key, transaction_status } = body
  if (
    !order_id ||
    !status_code ||
    !gross_amount ||
    !signature_key ||
    !transaction_status
  ) {
    return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 })
  }

  if (
    !verifyMidtransSignature(
      { order_id, status_code, gross_amount, signature_key },
      serverKey
    )
  ) {
    return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 403 })
  }

  await settleOrder({
    orderId: order_id,
    transactionStatus: transaction_status,
    transactionId: body.transaction_id,
    paymentType: body.payment_type,
    fraudStatus: body.fraud_status,
    rawNotification: body,
  })

  return NextResponse.json({ ok: true })
}
