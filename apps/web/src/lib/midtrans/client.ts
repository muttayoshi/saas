import "server-only"

const IS_PROD = process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
const SNAP_BASE = IS_PROD
  ? "https://app.midtrans.com/snap/v1/transactions"
  : "https://app.sandbox.midtrans.com/snap/v1/transactions"
const API_BASE = IS_PROD ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com"

function authHeader() {
  const key = process.env.MIDTRANS_SERVER_KEY
  if (!key) throw new Error("MIDTRANS_SERVER_KEY is not set")
  return "Basic " + Buffer.from(key + ":").toString("base64")
}

export async function createSnapTransaction(params: {
  orderId: string
  amount: number
  itemName: string
  customer: { name: string; email: string }
}): Promise<{ token: string; redirect_url: string }> {
  const res = await fetch(SNAP_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify({
      transaction_details: { order_id: params.orderId, gross_amount: params.amount },
      item_details: [
        {
          id: params.orderId,
          price: params.amount,
          quantity: 1,
          name: params.itemName.slice(0, 50),
        },
      ],
      customer_details: {
        first_name: params.customer.name,
        email: params.customer.email,
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Midtrans Snap error ${res.status}: ${body}`)
  }
  return res.json()
}

export async function getMidtransStatus(orderId: string): Promise<{
  transaction_status: string
  transaction_id?: string
  payment_type?: string
  status_code: string
  gross_amount: string
  signature_key?: string
}> {
  const res = await fetch(`${API_BASE}/v2/${encodeURIComponent(orderId)}/status`, {
    headers: { Accept: "application/json", Authorization: authHeader() },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Midtrans status error ${res.status}: ${body}`)
  }
  return res.json()
}
