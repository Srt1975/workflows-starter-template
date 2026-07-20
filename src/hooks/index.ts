import { WorkflowEntrypoint, WorkflowEvent, WorkflowStep } from "cloudflare:workflows";

export class MyWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const order = event.payload;

    // Step 1: Validate the order
    await step.do("validate order", async () => {
      if (!order.orderId || !order.total) {
        throw new Error("Missing required order fields: orderId, total");
      }
      return { ok: true };
    });

    // Step 2: Compose email content
    const emailContent = await step.do("compose email", async () => {
      const subject = `New Order #${order.orderId} — thomureapiaries.com`;
      const html = `
        <h1>🐝 New Order Received</h1>
        <p><strong>Order ID:</strong> ${order.orderId}</p>
        <p><strong>Customer:</strong> ${order.customerName || "N/A"}</p>
        <p><strong>Customer Email:</strong> ${order.customerEmail || "N/A"}</p>
        <p><strong>Total:</strong> $${order.total}</p>
        <h3>Items:</h3>
        <ul>
          ${(order.items || []).map((i: any) => `<li>${i.name} × ${i.quantity} — $${i.price}</li>`).join("")}
        </ul>
      `;
      const text = `New Order #${order.orderId}\nCustomer: ${order.customerName || "N/A"}\nTotal: $${order.total}`;
      return { subject, html, text };
    });

    // Step 3: Send the email (auto-retried on failure)
    await step.do("send notification email", async () => {
      await this.env.EMAIL.send({
        from: "orders@thomureapiaries.com",
        to: "steven@thomureapiaries.com",
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      });
      return { sent: true };
    });
  }
}

// HTTP entry point — your website POSTs order data here
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Send a POST with order JSON to trigger the workflow.", {
        status: 405,
      });
    }

    let order: Record<string, unknown>;
    try {
      order = await request.json();
    } catch {
      return new Response("Invalid JSON body", { status: 400 });
    }

    const instance = await env.MY_WORKFLOW.create({
      id: `order-${order.orderId || crypto.randomUUID()}`,
      payload: order,
    });

    return Response.json({
      message: "Workflow triggered",
      instanceId: instance.id,
    });
  },
} satisfies ExportedHandler<Env>;
