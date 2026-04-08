-- Add last_invoice_amount_cents to subscriptions
-- Populated by the stripe-webhook on checkout.session.completed and invoice.payment_succeeded
ALTER TABLE public.subscriptions
    ADD COLUMN IF NOT EXISTS last_invoice_amount_cents INTEGER;
