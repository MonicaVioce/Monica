# Public API

Monica accepts public case requests at `POST /api/requests`. This endpoint does
not require an API key and accepts browser requests from any origin.

Submitting a request records it for review; it does **not** immediately place a
phone call. Placing calls and viewing stored case details are administrative
operations, because they can incur telephony costs and include personal data.

## Submit a request

```bash
curl -X POST "https://your-public-domain.example/api/requests" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Alex",
    "customer_phone": "+14045551234",
    "company": "Hotel A",
    "reservation_or_case_id": "ABC123",
    "issue": "The room was unusable due to pests.",
    "requested_resolution": "A partial refund",
    "acceptance_limit": "Do not accept an offer without customer approval.",
    "authorized_actions": ["Request a manager", "Request a case number"]
  }'
```

### Request body

All text fields accept up to 2,000 characters. Required fields are marked with
an asterisk.

| Field | Type | Description |
| --- | --- | --- |
| `customer_name`* | string | Name of the customer Monica is representing. |
| `company`* | string | Company to contact. |
| `issue`* | string | What went wrong. |
| `requested_resolution`* | string | The outcome the customer wants. |
| `customer_phone` | string | Optional E.164 callback number, e.g. `+14045551234`. |
| `reservation_or_case_id` | string | Optional account, reservation, or case reference. |
| `acceptance_limit` | string | Optional boundary for offers or settlements. |
| `authorized_actions` | string[] | Optional list of up to 20 actions Monica may take. |

Never submit passwords, payment-card numbers, one-time codes, or identity
documents.

### Success response — `201 Created`

```json
{
  "request_id": "req_7d9b6d95-6490-4109-a42c-819c563bf4a5",
  "status": "submitted",
  "submitted_at": "2026-08-10T01:23:45.678Z"
}
```

Save `request_id` in your own system. The public API intentionally does not
provide a read endpoint, so submitted personal data is not exposed to anyone
who knows an ID.

### Errors

| Status | Meaning |
| --- | --- |
| `400` | Malformed JSON or a field failed validation. The response includes `error`. |
| `413` | Request body is larger than 60,000 bytes. |
| `415` | The request did not use `Content-Type: application/json`. |

## Browser usage

`POST /api/requests` supports CORS from all origins and responds to `OPTIONS`
preflight requests. For example:

```js
const response = await fetch('https://your-public-domain.example/api/requests', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    customer_name: 'Alex',
    company: 'Hotel A',
    issue: 'The room was unusable due to pests.',
    requested_resolution: 'A partial refund',
  }),
});

const result = await response.json();
```

## Storage

Set `KV_REST_API_URL` and `KV_REST_API_TOKEN` for durable request storage. In
their absence, Monica uses in-memory preview storage, which is lost when the
server restarts. See [the local development guide](LOCAL_DEVELOPMENT.md) for
the rest of the deployment setup.
