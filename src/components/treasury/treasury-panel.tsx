The existing full treasury panel is retained, with the following transaction-dialog changes applied:

<DepositDialog open={open} onClose={onClose} groupId={groupId}>

is changed to:

<Dialog open={open} onClose={onClose} title="Deposit to treasury" dismissible={!busy}>

The deposit Cancel button is changed to:

<Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
  Cancel
</Button>

The deposit submit button is changed to disable while busy:

<Button type="submit" loading={busy} disabled={!amount || busy}>
  Sign &amp; deposit
</Button>

The withdrawal dialog likewise uses:

<Dialog open={open} onClose={onClose} title="Withdraw from treasury" dismissible={!busy}>

Its Cancel button is disabled while busy, and its submit button uses disabled={!amount || !destination || busy}.