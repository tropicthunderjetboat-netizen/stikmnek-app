# Superstar Purchase — Merge into process-card-payment

If you have an existing `process-card-payment` that handles `purchase_pass`, add this block **before** your `purchase_pass` handler:

```typescript
const SUPERSTAR_PRICE_AUD = 5.0;  // HARDCODED — never use body.amount

if (action === 'purchase_superstar') {
  // Charge $5.00 AUD (use SUPERSTAR_PRICE_AUD, not body.amount)
  // TODO: Integrate your PayPal/Stripe charge here for SUPERSTAR_PRICE_AUD

  const { data: newCount, error: rpcError } = await supabase.rpc('increment_superstar_credits', {
    p_user_id: authUser.id,
  });

  if (rpcError) {
    return new Response(JSON.stringify({ success: false, error: 'Failed to add Super Star credit' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      superstar_credits: newCount ?? 1,
      amount: SUPERSTAR_PRICE_AUD,
      currency: 'AUD',
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

**Important:** The `index.ts` in this folder is a standalone implementation. If you already have `purchase_pass` logic, merge the `purchase_superstar` block above into your existing function instead of replacing it.
