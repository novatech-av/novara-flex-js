# Live validation notes

The SDK's types come from an unofficial OpenAPI description derived from the vendor's
public documentation. The opt-in live test suite (see
[Live API tests](../CONTRIBUTING.md#live-api-tests)) checks that description against the
real API with read-only calls; where the two disagree, the description follows the wire.

Observations from running the live suite against the live API, starting 2026-09-13, that
the OpenAPI contract cannot express, or that could not be confirmed:

- An invalid token is rejected with `error: "token_invalid"`. The vendor's protocol page
  shows `invalid_token` in one example; the wire and this contract use `token_invalid`.
- Calls occasionally stall: an identical `projects.list` request that normally answers in
  under 300 ms hung past 20 s more than once, then answered immediately on retry. The SDK
  had no retry then, so live runs could time out for upstream reasons; its default 60 s
  timeout (see [Timeouts and cancellation](../README.md#timeouts-and-cancellation)) now
  bounds a request that hangs outright, and a read that times out is now retried (see
  [Retries](../README.md#retries)).
- `users.list` takes no paging parameters and returns the entire roster in one response,
  which can be large, alongside an undocumented `columns` array of the column keys the
  account exposes. `projects.list` pages with `limit`/`page`, and its
  `paging.last_page` counts pages at the requested `limit`, not records.
- The shape of a `Project.attachments` entry is unverified: not yet observed on the wire.
  The contract leaves the item open.
- `Role`, `LineOfBusiness`, `Company`, and `FieldOffice` are verified against the wire:
  their fields matched the contract exactly. `JobTitle` is unverified: not yet observed on
  the wire. The live tests skip the per-item checks for an empty list
  rather than fail, since an account need not configure every list.

From the equipment and project run on 2026-09-14:

- `EquipmentMetafield.list_id` is `null` for a metafield that is not backed by a list. The
  contract said `integer`; it now says `integer | null`, which is the only spec change this
  round. `Account.userMetafields[].list_id` keeps `integer`, since a null there is
  unverified.
- `EquipmentType` matched the contract (`id`, `title`, `created`, `metafields`). The
  inspection-schedule entry of its `schedules` is unverified: not yet observed on the wire.
- `Equipment` matched the contract for every field it returned, and the wire carries two
  fields the contract does not name: `projects` (an array of objects) and a singular
  `assignedUser_id` alongside the documented `assignedUsers_id`. Both survive in the
  returned body, since nothing is stripped. (`projects` turned out to be in the vendor's
  docs example after all and joined the contract on 2026-09-29; see the documentation
  re-check below.)
- `Equipment.status` and `Equipment.schedules` are unverified: not yet observed on the
  wire, so `EquipmentScheduleStatus` and the `uptodate`/`expiring`/`expired` enum are
  untested against the wire.
- `projects.info` takes `project_id` (an integer), not the `id` that `users.info` takes,
  and returned a project whose fields matched the contract — including `created`/`updated`
  as numeric *strings*, which is why the contract types them as string-or-integer.

From the contractor run on 2026-09-19:

- All four contractor methods answer `ok: true` (or a well-formed `ok: false`). The
  `Contractor`, `ContractorContact`, and `ContractorRequirement` shapes are **entirely
  unverified**: not yet observed on the wire. The live tests assert the envelope and
  paging shape, and check items only when there are any, as they do for
  `jobtitles.list`. Nothing in the contract changed this round.
- Both list methods return `paging`, with `total` and `last_page` as integers. The
  contract then marked `paging` optional, so the tests checked it only when it was
  present; since 2026-09-29 it is required (see the required-properties run below).
- The two `limit` maxima genuinely differ: `contractors.list` accepts up to 1000 and
  `contractor-requirements.list` up to 500. Both maxima, plus `status: "approved"` and
  `type: "Upload"`, were accepted without error.
- `contractor-contacts.list` answers an unknown `contractor_id` with `ok: true` and an
  empty `contacts` array rather than an error, so a wrong id is indistinguishable from a
  contractor with no contacts.
- `contractor-requirement.info` answers an unknown `requirement_id` with `ok: false` and
  `error: "server_error"` — not `content_not_found` — through the namespace and through
  `flex.call` alike. That is also the confirmation that the SDK's fold hits the vendor's
  singular path: `flex.contractorRequirements.info()` and
  `flex.call("contractor-requirement.info", ...)` reach the same endpoint and report the
  same method name.

From the forms and responses run on 2026-09-19:

- `formfolders.list`, `forms.list`, `forms.info`, `responses.list`, `responses.info`,
  `responses.flat`, and `followups.list` each answered `ok: true` and were checked against
  the contract.
- Four fields disagreed with the contract and the contract was corrected. `Followup.due`
  is `integer | null`, `Followup.m_completer_id` is `string | null`, and
  `Followup.resolved_on` is `string | integer | null` — all three are null while a
  follow-up is open. `FormSummary.folder_id` is `integer | null` for a form that is not
  filed in a folder. `FormDetail.folder_id` was changed to match, though that field has
  not yet been observed on the wire.
- Timestamps in these areas are numeric *strings*, not the epoch integers the docs
  describe, so the contract now types them as string-or-integer: `Followup.created_on` and
  `Followup.updated_on` always, and `FormResponse.created` / `FormResponse.updated` from
  `responses.info` — the very same fields come back as integers from `responses.list`.
  `FollowupMessage.date` stays an integer.
- `responses.flat` answers JSON with `{ ok, responses, paging }` plus an undocumented
  top-level `description` string. `responses` is an array of flat objects keyed by the
  form's own field ids, with string, number, or null values; the contract now names the
  array and leaves each row open, because the keys are per-form field titles. Unless
  `skip_field_id_mapping_json` is true, the first row is a field-ID to field-title mapping
  row whose values are all strings, and it is *not* counted against `limit` — `limit: 1`
  returns two rows, and the same request with `skip_field_id_mapping_json: true` returns
  one. `responses.list` carries the same `description` key; its docs example does show
  that one, and the contract has named it since 2026-09-29.
- `format: "csv"` really does return `content-type: text/csv` with the
  `novaraflex-total-results` and `novaraflex-last-page` headers set, which is why
  `flex.call` reports the CSV document as a `NovaraFlexTransportError`; see the
  2026-09-29 CSV run below for `flex.responses.flatCsv()`.
- The wire carries fields the contract does not name, and they survive in the returned
  body: `Followup` adds `deleted`, `field_id`, and `in_progress`, `FollowupMessage` adds
  `notify` (documented after all, and in the contract since 2026-09-29), and
  `FormDetail.latest.fields[]` entries add a dozen presentation flags such as `hidden` and
  `varName`.
- Still unverified, not yet observed on the wire: `Inspection`,
  `FollowupMessage.m_reassignee_id`, the `caption` of a follow-up attachment, and
  `FormResponse.pending_followup_assignees_id` (the follow-up assignees are reachable
  through `followups.list` instead).
  `FollowupMessage.signature` arrives as `null` or an object and stays untyped in the
  contract, so the live tests leave it unchecked.
- All four `followups.list` statuses (`all`, `open`, `closed`, `overdue`) were accepted,
  as were `limit: 500` on `followups.list` and `responses.list` and `limit: 1000` on
  `responses.flat`. The vendor's own prose for `responses.list` says up to 100 responses
  while its parameter table says `limit` max 500; the table is right — 500 was accepted
  and 501 was rejected with `error: "parameter_invalid"` — and the contract follows it.

From the training, acknowledgment, and compliance run on 2026-09-20:

- All ten methods answered `ok: true`. That includes both
  `establishments.*` methods, even though the vendor's documentation labels the area
  *coming soon* and the contract still carries the `x-novara-coming-soon` marker: no
  unknown-method error was seen. It also includes both
  versioned methods, reached through the namespace and through `flex.call` under their
  `trainings.v2.list` / `completedtrainings.v2.list` names.
- `osha-hours.list` was the one contract change this round. Its JSON success schema had
  only `ok` and `paging` — the published docs give no JSON example for the method — but
  the wire carries a result array named `hours`, so the contract now names it (required)
  and models its items as a new `OshaHoursEntry` schema: `id`, `establishment_id`, `year`,
  and `month` as integers, `hours` as a number, and `client_id`, `fo_id`, and `lob_id`
  left deliberately *untyped*, because their non-null shape is unverified and there is
  no documentation to say what it would be. The item stays open
  (`additionalProperties: true`). The CSV-only paging headers were not exercised on this
  run; the 2026-09-29 CSV run below found their real names.
- `establishments.info` really does answer with `establishment` as an **array** holding the
  single match, not as an object. The contract already said so, and nothing unwraps it.
- Three shapes are unverified, not yet observed on the wire: `DriverQualificationUser`
  and `DriverQualificationRequirement`; `TrainingCompletionStatus`; and the attachment
  entry of a completed training's `files`. The live tests check each only when one is
  present, as they do for `jobtitles.list`.
- The acknowledgment audience arrays (`specificEmployees_id`, `fieldOffices_id`,
  `linesOfBusiness_id`, `jobTitles_id`) are unverified: not yet observed on the wire.
  `recipients` appears only on `acknowledgments.info`, never on
  `acknowledgments.list`. Where recipients were present, `acknowledgedOn` arrived as both
  an integer and null, which is what the contract says.
- The `Training` wire record carries three fields the contract does not name — `course_id`,
  `folder`, and `training_folders_id` — and they survive in the returned body, since
  nothing is stripped. They are left out of the contract the same way
  `Equipment.assignedUser_id` is: the spec tracks the published documentation, and
  undocumented extras are recorded here instead.
- `training-employee-status.list` returns a top-level `last_updated` integer alongside
  `paging`, consistent with the vendor's note that these results may be cached for 15
  minutes. `completedtrainings.v2.list`, `training-employee-status.list`, and
  `osha-hours.list` all honored `limit: 5` and returned `paging` with integer `total` and
  `last_page`.
- `flex.call("osha-hours.list", { format: "csv" })` answers a CSV document, which `call`
  reports as a `NovaraFlexTransportError` — why `flex.oshaHours.list` narrows `format` to
  `"json"`, as `flex.responses.flat` does; `flex.oshaHours.listCsv()` is the CSV route.

From the resource and custom-data run on 2026-09-20:

- All four methods answered `ok: true`, and `DataList`, `DataListItem`, `Resource`, and
  `ResourceCategory` are verified against the wire. None of the four returns `paging`:
  each answers with everything at once.
- `resourcetags.list` answers under a **`resourcetags`** key, not the `resourcecategories`
  the contract declared, and the contract was corrected. The item schema keeps the name
  `ResourceCategory`, which is what the vendor's own prose calls the thing its method name
  calls a tag; only the container was wrong.
- `Resource.versions[].file` is `string | null`, and the contract now says so. It is null
  exactly on the versions published as a link rather than an upload, every one of which
  carried a non-empty `link`. Those two changes
  are the only spec changes this round.
- `ResourceCategory` carries no `id` on the wire: every entry had exactly `name`,
  `sequence`, and `roles_id`, so a tag is identified by its name. `Resource.category_id`
  is therefore unresolvable from this method, and that field is unverified: not yet
  observed on the wire. What a resource does carry is `tags`, an array of tag
  *names*.
- Two undocumented keys ride along, and both survive in the returned body:
  `Resource.versions[].size`, an integer present on exactly the versions whose `file` is
  a string, and `DataListItem.deleted`, a boolean that appears only when
  `include_deleted: true` is passed. They are left out of the contract the same way
  `Equipment.assignedUser_id` and `Training.course_id` are, and recorded here instead.
- The effect of `include_inactive: true` is unverified; `include_deleted: true` is what
  adds the `deleted` key. Passing a `data_list_id` that names no list is not an error: the vendor answers
  `ok: true` with an empty array, the way `contractor-contacts.list` does for an unknown
  contractor, so a wrong id is indistinguishable from an empty list.
- Fetching a resource version's uploaded document means `attachment.load`, which answers
  with a file rather than a JSON envelope. It was not called on this run; see the
  2026-09-29 attachment run below for `flex.attachment.load()`.
- The stall first noted on 2026-09-13 was far worse on this run. Measured end to end,
  ordinary calls took 25-38 s each — `api.echo`, which carries no data at all, among them.
  At the suite's former 30 s per-test timeout a different random handful of tests failed
  on every run, never the same set and never with an assertion error, so
  `vitest.live.config.ts` now allows 120 s per test. That bound exists to stop one hung
  request wedging the suite, not to assert vendor latency. The SDK now bounds each call
  at 60 s by default — chosen so these slow-but-healthy calls still succeed — and now
  retries a read whose attempt times out.

From the data-load run on 2026-09-21:

- **`dataload.create` was never called.** It writes to the account — it synchronizes
  employees or other records from a CSV — and it can send email, and the live suite runs
  against a real account, so no run of this SDK has ever invoked it, not from
  the live suite and not from a probe. `DataLoadCreate` is therefore unverified against
  the wire, and so is `DataLoad` as it looks for a load that actually exists: the
  `created`, `creator_id`, `adapter`, `status`, and `history` fields, and the
  `dataload`/`dataloading`/`dataloaded`/`error` status enum with them. All of it is
  modeled from the vendor's documentation alone. The one live check this area gets is an
  error path.
- `dataload.info` with a well-formed 24-character hex id that cannot name a load answers
  `ok: false` with `error: "content_not_found"` — the documented not-found code, unlike
  `contractor-requirement.info`, which reports `server_error` for an id it cannot
  resolve. The response carried an `HZS-Request-ID` but no `description`.
- There is no `dataload.list`. An id can only come back from `dataload.create`, which is
  why a real load cannot be inspected without writing, and why the unknown-id rejection
  is the whole of the live coverage here.
- No spec change this round: the contract already matched everything that could be
  observed.

On rate limits, 2026-09-30:

- **The rate-limit response shape has not been observed live** and is deliberately left
  unverified: whether the vendor answers with `HTTP 429` or an `HTTP 200`
  `rate_limit_exceeded` envelope, and whether it sends `Retry-After`. The SDK handles
  both shapes, with or without the header. Triggering the limit on purpose would disrupt
  every other integration sharing the same pool for about a minute, so
  no run of this SDK has done it.

From the paging run on 2026-09-29:

- Every paged method's `limit` maximum in the contract is the real one: `projects.list`,
  `contractor-requirements.list`, `responses.list`, and `followups.list` accept 500, and
  `contractors.list`, `responses.flat`, `completedtrainings.v2.list`,
  `training-employee-status.list`, and `osha-hours.list` accept 1000. In each case one
  more was rejected with `error: "parameter_invalid"`. Each answered with its items in the
  array key the contract names (`projects`, `contractors`, `requirements`, `responses`,
  `followups`, `completedtrainings`, `employees`, `hours`) and with `paging`, including
  `{ total: 0, last_page: 0 }` for an empty list.
- `training-employee-status.list` carries an undocumented `page` inside `paging`
  alongside `total` and `last_page`; the contract's `Paging` already allows extra keys.
- `responses.flat` repeats its field-ID to field-title mapping row at the top of **every**
  page, not only the first: with a small `limit`, every page held exactly the data rows of
  the same request with `skip_field_id_mapping_json: true`, behind one extra row whose
  values were all strings. Each page's mapping row covers only the columns present on that
  page's data rows, so the rows can differ from page to page; where they overlap the
  titles are identical. `flex.responses.flatAll()` therefore
  yields response rows only, dropping every page's mapping row, and leaves each page's
  row at `responses[0]` in `.pages()`, where merging them gives every title.
- A page past `last_page` answers with an empty `responses` array for both
  `responses.flat` and `responses.list`.

From the count run on 2026-09-29:

- All nine paged methods answer `limit: 1, page: 1` with `paging.total` as a
  non-negative integer, so `.count()` works for each of them.
- On a form with responses, `responses.flat`'s `paging.total` is the same with and without
  `skip_field_id_mapping_json: true`, equals the number of data rows a full
  `flatAll` walk yields, and equals `responses.list`'s total for the same form: the total
  counts responses, never the mapping row. `responses.list`'s total likewise equals the
  number of items its `listAll` walk yields.
- The time filters narrow the total: `after` set to the current time counts zero
  responses on that form.

From the CSV and attachment run on 2026-09-29:

- `responses.flat` with `format: "csv"` and `limit: 1`, on a form that has responses,
  answered `HTTP 200` with `text/csv`, a non-empty document, and integer
  `novaraflex-total-results` and `novaraflex-last-page` headers — plus identical legacy
  `iscout-` and `kpaehs-` pairs, which the SDK ignores. It did not redirect. Its CSV
  `total` equals the JSON `paging.total` for the same form.
- `osha-hours.list` with `format: "csv"` answered `HTTP 200` with `text/csv`, a non-empty
  document, and integer **`novaraflex-`** paging headers only. The contract had named the
  `kpaehs-total-results` / `kpaehs-last-page` pair the vendor's docs give for this
  method; neither was sent, and the contract was corrected. It did not redirect either.
- Follow-ups carry attachment keys in `messages[].attachments[].key`. Every key tried
  answered `attachment.load` with **`HTTP 302`** to a
  **cross-origin** `https:` `Location`; a `GET` there without a body answered `HTTP 200`
  with the file. The vendor documents several media types and uploads may come in more,
  so the SDK accepts any type but HTML. The contract now models the 302.
- An unknown key answered `HTTP 200` with an `application/json` error envelope, no
  redirect, and the code `invalid_key_for_customer`, which the contract's error-code enum
  now lists.

From the documentation re-check on 2026-09-29:

- The contract was compared with every published method page. The method set is
  identical, and the one request-side gap was a `followup_display_id` boolean the docs
  list on `followups.list`, `responses.list`, and `responses.info`. Request bodies reject
  unknown keys, so the SDK's types refused it until the contract gained it. All three
  methods accept it live, `responses.list` even without the `latest: true` its docs say
  it requires.
- With the flag set, every follow-up carried `followup_display_id` as a **string**; the
  docs example shows a number, and the contract follows the wire. Without the flag the
  field is absent.
- Documented response properties the contract lacked were added as optional:
  `Followup.followup_display_id`, `FollowupMessage.notify` (a boolean present on some
  messages), `Equipment.projects` (an array of `{ id, name }`), the top-level
  `description` string of `responses.list`, and
  `ContractorRequirement.related_id` / `description`, which stay unverified like the rest
  of the contractor shapes.
- The docs pages carry no nullability markers for responses; the only evidence is a
  `null` in an example. Two fields the contract typed non-null show one:
  `EquipmentScheduleStatus.expiresOn` / `expiringOn` / `lastCompletedOn` and
  `FollowupMessage.m_reassignee_id`, which are now nullable. Both nulls are unverified
  on the wire. No other field changed: the `User` fields have no `null` in either users
  page of the docs, and none was observed on the wire either.
- Where the docs examples show the values of a field the contract types as a plain
  string, the property description lists them, without an enum: for example
  `Training.schedule_type` (`rolling`, `window`) and `Resource.versions[].type` (`file`,
  `link`), each matched by every live record. `EquipmentMetafield.type` is not a closed
  set: the live API has returned at least one value beyond the documented `text`, `number`,
  and `list`.
- `training-employee-status.list`'s `last_updated` is a response property, not a request
  parameter. `TrainingCompletionStatus.is_required` appears only with
  `include_all_completions: true`, as documented; with it, every completion carried it.

From the required-properties run on 2026-09-29:

- The contract now marks response properties `required` where the evidence supports it,
  so ids, names, and the like are no longer `T | undefined`: `forms[n].id` is a `number`.
  A property is required only where every record observed on the live API, from every
  method that returns its schema, carried it (observed read-only through full pages at
  each method's maximum `limit`, the same bounded lookups the live suite uses, and
  `.info` calls). Present-but-null counts as present, so a property
  such as `FormSummary.folder_id` is required *and* nullable.
- Where the evidence is too thin to judge, only a schema's identity fields (`id`,
  `name`) are required: `Account`, `Acknowledgment`, `Company`, `Establishment`,
  `LineOfBusiness`, and `Role`. `AcknowledgmentRecipient` has none. Schemas not yet
  observed on the wire (`JobTitle`, the contractor schemas, `Inspection`, the driver
  qualification schemas, `TrainingCompletionStatus`, `DataLoad`) require nothing, and
  neither do properties that appear only behind a request flag, such as
  `Followup.followup_display_id`, or only from one of the methods sharing a schema, such
  as `FormResponse.latest`, which `responses.list` omits.
- The nine paged methods always sent `paging` with integer `total` and `last_page`, even
  past the last page, so `paging` and both fields are required. The paginator still
  guards against a page without them at runtime.
- Two fields arrived as null although the contract said otherwise, and are now nullable:
  `CompletedTraining.notes` and `Training.expiring_days`.
- Every live-suite field table now carries the list of keys its schema requires, checked
  by the compiler against the public response types in both directions, and the run
  fails naming the schema and field if a required key is missing on the wire.

From the nested-shape run on 2026-09-29:

- The nested shapes the docs examples describe are now typed instead of left open:
  `response.latest` (`FormResponseRevision`: submitter, timestamps, versions,
  `location`, `weather`, and the `responses` answer map), each answer
  (`FormResponseAnswer`: `value`, `attachments`, `fups`), the follow-ups embedded in a
  response (`ResponseFollowup`), `EquipmentType.schedules[]` (`EquipmentTypeSchedule`
  with its `trigger`), and `Training.assigned_to_condition` (with its `data`). An
  answer's `value` stays `unknown`: its shape depends on the field type.
- Checked on the wire with the live suite's bounded lookups (the first five forms,
  `responses.list` with and without `latest: true`, several `responses.info` calls, and
  the responses behind one page of open follow-ups): every property of
  `FormResponseRevision` arrived on every revision, so all but `fups` are required, as are
  `lon`, `lat`, and `accuracy` of a location and an answer's `value`.
- `latest.location` is **null** on responses without a location, although the docs
  example shows an object; the contract makes it nullable. `latest.weather` was always
  sent but was an empty object on some responses, so none of its properties is required.
  Temperatures, wind speeds, and accuracies arrive with and without a fraction, so they
  are `number`.
- The docs show `attachments: []` on every answer; the wire sends it only on answers that
  have attachments, so it is optional. Each attachment carries a `key`, and occasionally
  a `caption`.
- Follow-ups arrive on the answer they were raised on (`latest.responses[field].fups`),
  never at the two places the docs examples also show them, the response's own `fups` and
  `latest.fups`. They are not `Followup` objects: the wire sends `created_on` /
  `updated_on` as integers, and `followup_display_id` (behind the request flag) as an
  **integer**, as in the docs example, where `followups.list` sends a string. They get
  their own `ResponseFollowup` schema, whose `messages` reuse `FollowupMessage`.
- The wire carries fields the docs do not name, and they survive in the returned body:
  `latest.duration`, `location.time` and `geoTime`, an answer's `notes`, and, on an
  embedded follow-up, `form_id`, `response_id`, `field_id`, `in_progress`, `deleted`, and
  `m_customer_id`.
- Still **unverified against the wire**, so typed from the docs examples with nothing
  required: `FormResponse.fups` and `FormResponseRevision.fups`; an embedded follow-up's
  `resolved_on` and `m_completer_id` once resolved (so `resolved_on` keeps `Followup`'s
  string-or-integer type); `EquipmentTypeSchedule` and `EquipmentScheduleTrigger` (so the
  documented `timing` values `rolling`, `dom`, and `dow` are listed in the description,
  not as an enum); and the contents of `TrainingAssignmentCondition.data`.
  The live suite checks each of them whenever one appears.
