import {loadEnvFile} from 'node:process'
try {
  loadEnvFile()
} catch {}

import {defineCapability, dispatchit} from 'dispatchit'
import * as z from 'zod'

const deliveryStatuses = ['confirmed', 'preparing', 'out_for_delivery', 'delivered'] as const

interface MockDelivery {
  orderId: string
  status: (typeof deliveryStatuses)[number]
  /** ISO date (YYYY-MM-DD) the delivery is scheduled for. */
  deliveryDate: string
}

/** In-memory mock store keyed by phone number — the demo has no database. */
const deliveriesByPhone = new Map<string, Array<MockDelivery>>()

export const config = dispatchit({
  webhookSecret: process.env.DEMO_WEBHOOK_SECRET ?? 'dev-webhook-secret',
  // The demo authorizes every WhatsApp number.
  onAuth: () => true,
  capabilities: {
    listOrders: defineCapability({
      description: "List the customer's deliveries with their current status.",
      access: 'public',
      input: z.object({}),
      onSuccess: z.object({
        orders: z.array(
          z.object({orderId: z.string().trim(), status: z.enum(deliveryStatuses), eta: z.string().trim()})
        ),
      }),
      onFail: {message: 'I could not load the deliveries right now. Ask the customer to try again shortly.'},
      handler: async ({context}) => ({
        orders: deliveriesFor(context.phoneNumber).map(delivery => ({
          orderId: delivery.orderId,
          status: delivery.status,
          eta: etaFor(delivery),
        })),
      }),
    }),

    getDeliveryStatus: defineCapability({
      description: 'Look up the status and delivery window of one delivery by its order id.',
      access: 'public',
      input: z.object({
        orderId: z.string().trim().min(1),
      }),
      onSuccess: z.object({
        orderId: z.string().trim(),
        status: z.enum(deliveryStatuses),
        eta: z.string().trim(),
      }),
      onFail: {
        message: 'I could not find a delivery with that order id. Ask the customer to double-check it.',
      },
      handler: async ({input, context}) => {
        const delivery = deliveriesFor(context.phoneNumber).find(order => order.orderId === input.orderId)
        if (!delivery) throw new Error('Unknown order id')

        return {orderId: delivery.orderId, status: delivery.status, eta: etaFor(delivery)}
      },
    }),

    rescheduleDelivery: defineCapability({
      description:
        'Reschedule a delivery to a new date (YYYY-MM-DD). Deliveries that are out for delivery or already delivered cannot be rescheduled.',
      input: z.object({
        orderId: z.string().trim().min(1),
        newDate: z.iso.date(),
      }),
      onSuccess: z.object({
        orderId: z.string().trim(),
        status: z.enum(deliveryStatuses),
        eta: z.string().trim(),
      }),
      onFail: {
        action: 'reroute-to-human',
      },
      handler: async ({input, context}) => {
        const delivery = deliveriesFor(context.phoneNumber).find(order => order.orderId === input.orderId)
        if (!delivery || delivery.status !== 'confirmed') throw new Error('Delivery cannot be rescheduled')

        delivery.deliveryDate = input.newDate
        return {orderId: delivery.orderId, status: delivery.status, eta: etaFor(delivery)}
      },
    }),
  },
})

function deliveriesFor(phoneNumber: string): Array<MockDelivery> {
  let deliveries = deliveriesByPhone.get(phoneNumber)
  if (!deliveries) {
    deliveries = [
      {orderId: 'DLV-1001', status: 'out_for_delivery', deliveryDate: isoDateOffset(0)},
      {orderId: 'DLV-1002', status: 'confirmed', deliveryDate: isoDateOffset(3)},
      {orderId: 'DLV-1003', status: 'delivered', deliveryDate: isoDateOffset(-2)},
    ]
    deliveriesByPhone.set(phoneNumber, deliveries)
  }
  return deliveries
}

function etaFor(delivery: MockDelivery): string {
  return delivery.status === 'delivered' ? 'already delivered' : `expected on ${delivery.deliveryDate}`
}

function isoDateOffset(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}
