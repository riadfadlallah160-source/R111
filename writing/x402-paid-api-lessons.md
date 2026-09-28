# I Thought HTTP 402 Meant I Had a Paid API. It Didn't.

I built a small API gateway that charges for deterministic utility endpoints with USDC on Base. The first version looked correct from the server's point of view: a request hit a paid route, the server returned HTTP 402, and the response described how to pay.

That felt like the hard part.

It was not.

The hard part was proving that a buyer could move through the *entire* payment loop without knowing anything about my implementation: discover the resource, understand the price, pay, retry the request, receive the result, and leave behind settlement evidence I could reconcile.

The difference sounds obvious now. It was not obvious while I was building it.

This is what I learned.

## A 402 response is a protocol state, not revenue

An HTTP 402 is useful because it tells a client, "this resource requires payment." But a 402 is not evidence that anyone paid.

That distinction became the first rule of the system:

> Never count an advertised price, a successful discovery crawl, or a valid 402 response as revenue.

A paid API has at least three different states that are easy to accidentally collapse into one:

1. **Discoverable** — a client can find the route and its payment requirements.
2. **Payable** — a compatible client can actually construct and submit the payment the server expects.
3. **Settled** — the payment has reached the receiving account and can be independently reconciled to the request.

A service can be perfectly discoverable and still be impossible to pay. It can be payable in theory and still fail after the client retries. And it can return a successful application response while your settlement accounting is broken.

Those are different failures and should be measured separately.

## The buyer is the integration test

My early instinct was to validate the server from the inside out:

- Is the endpoint alive?
- Does the middleware intercept unpaid requests?
- Does the payment requirement serialize?
- Does the paid handler return deterministic output?

All of those tests matter. None of them prove the commercial path.

The better test starts from the buyer's side.

Imagine a client that has never seen your code. It receives a URL. From there, it needs to answer:

- What network is this payment on?
- What asset should I send?
- Where should I send it?
- How much?
- What exact request must be retried after payment?
- How is proof attached?
- What does success look like?

If any of those answers require tribal knowledge, a private Slack message, or a human to explain the response, the API is not self-serve yet.

That is why external validators turned out to be more valuable than another internal unit test. An independent client that can parse the requirement and simulate the paid path is testing the thing I actually care about: interoperability.

## Machine-readable metadata has to be boring

Payment metadata is the wrong place to be clever.

One bug I ran into was exactly the kind that looks harmless to the server and fatal to a client: a field that should have been a plain URL string was represented in a shape that a downstream validator did not accept.

The server knew what it meant. The buyer did not care.

The lesson was broader than that one field. If a protocol says a property is a string, make it a string. If a discovery document has a defined schema, follow it literally. If a client expects one canonical route, do not make it infer among several almost-equivalent ones.

Payment integrations benefit from being aggressively unsurprising.

The same rule applies to endpoint behavior. A crawler using `GET` against a documented `POST` route is not evidence that the paid endpoint is broken. Logs need to distinguish malformed discovery traffic from an actual buyer attempting the documented transaction.

Otherwise you end up debugging noise.

## Validation and settlement need separate ledgers

Another mistake is treating "request succeeded" as "money arrived."

For a paid endpoint, I want two records:

### Execution record

- route
- request timestamp
- request identifier
- whether payment proof was accepted
- whether the actual work completed
- response status

### Settlement record

- amount
- asset
- network
- destination
- transaction identifier
- settlement timestamp
- confirmation state

Then I reconcile the two.

This matters because a payment rail can be temporarily unavailable while the API is healthy, or vice versa. It also prevents self-tests from contaminating revenue reporting. A transaction from your own wallet can prove the rail works; it cannot prove demand.

That sounds like accounting discipline, but it is also debugging discipline. When someone says "the paid call failed," you can locate the failure instead of arguing from one combined log.

## Price is not demand

The strangest psychological trap in pay-per-call systems is that pricing the endpoint makes it *feel* monetized.

I can write `$0.002/request` in a manifest in five seconds. That does not create a buyer.

The real funnel looks more like this:

```
listed -> discovered -> attempted -> paid -> executed -> settled -> repeated
```

Each arrow is a conversion.

If I only monitor HTTP traffic, I overestimate progress. If I only monitor the wallet, I cannot tell whether nobody wants the service or the payment flow is broken. If I only monitor marketplace listings, I can confuse distribution with demand.

So I now treat each stage as a separate metric.

The most important one is boring: independently verified external settlement attached to useful work.

Everything before it is evidence about the funnel, not revenue.

## The best paid API test is intentionally adversarial

Once the happy path works, I want to break it.

I test cases like:

- wrong network
- wrong asset
- insufficient amount
- stale or malformed proof
- retry without proof
- duplicate proof
- valid payment against the wrong route
- valid payment with application-level bad input

The goal is not only security. It is to make the contract legible.

For example, a valid payment should not magically turn an invalid application payload into a successful job. Payment authorization and business validation are separate concerns.

Likewise, a duplicate payment proof should not accidentally create duplicate work if the operation is meant to be idempotent.

Paid APIs combine two systems that fail independently: money movement and software execution. The edge cases live at their boundary.

## What I would build first next time

If I were starting another paid API from zero, I would build the smallest possible vertical slice:

1. One deterministic endpoint.
2. One payment network.
3. One asset.
4. One canonical payment requirement schema.
5. One external validator.
6. One settlement verifier.
7. One reconciliation record tying payment to work.

Only after that loop works would I add more routes.

It is tempting to build a catalog because catalogs look like businesses. A single route that an unknown client can discover, pay, execute, and verify is much closer to a business than fifty routes that only work in your own test harness.

## The useful definition of "working"

I used to define a working paid API as:

> The server returns 402 before payment and 200 after valid payment.

Now I use a stricter definition:

> A client I do not control can discover the resource, understand the terms, make the payment, receive the promised output, and leave behind independently verifiable settlement evidence that maps to the work performed.

That definition is less flattering during development.

It is also much more useful.

Because HTTP 402 is not the moment an API becomes a business.

The first real external settlement is.
