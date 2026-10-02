/**
 * Live validation of representative Novara Flex endpoints, of the paging
 * helpers over them, of the CSV and attachment methods, of the contract's
 * required properties and nested response shapes, and of the form field union
 * `forms.info` returns.
 *
 * These tests run against the real API and are opt-in: `pnpm test:live` only.
 * `pnpm test` and `pnpm check` never include them. Only read-only methods are
 * exercised — `api.ping`, `api.echo`, `account.info`, `users.list`,
 * `users.info`, `roles.list`, `jobtitles.list`, `fieldoffices.list`,
 * `linesofbusiness.list`, `companies.list`, `projects.list`, `projects.info`,
 * `equipments.list`, `equipmenttypes.list`, `contractors.list`,
 * `contractor-contacts.list`, `contractor-requirements.list`,
 * `contractor-requirement.info`, `formfolders.list`, `forms.list`,
 * `forms.info`, `responses.list`, `responses.info`, `responses.flat`,
 * `followups.list`, `inspections.list`, `acknowledgments.list`,
 * `acknowledgments.info`, `trainings.v2.list`, `completedtrainings.v2.list`,
 * `grouptrainings.list`, `training-employee-status.list`,
 * `driver-qualifications.list`, `osha-hours.list`, `establishments.list`,
 * `establishments.info`, `datalists.list`, `datalistitems.list`,
 * `resources.list`, `resourcetags.list`, `dataload.info`, and
 * `attachment.load` — through `call` and through the resource namespaces.
 *
 * The CSV documents and attachment files these read hold real people's
 * safety data: their tests assert types, sizes, and booleans only, and never
 * print a document, a byte, an attachment key, or a redirect URL.
 *
 * `dataload.create` is deliberately excluded: it is the SDK's only write
 * method, it synchronizes account records from a CSV and can send email, so it
 * is never called against a live account. `dataload.info` is exercised only
 * with an id that cannot exist.
 *
 * Three rules hold throughout:
 *
 * 1. The credential arrives through `inject("novaraFlex")`; no test reads
 *    `process.env` or hardcodes a token, and nothing ever logs a response body
 *    or an assertion message built from live data.
 * 2. A field whose live type disagrees with the contract is a defect in
 *    `openapi/novara-flex-openapi-3.1.yaml`, not a reason to loosen a test.
 * 3. The suite must never burst against the vendor's rate-limit pool, which it
 *    shares with every other integration on the same account. Every request
 *    goes through `createClient`, throttled to `LIVE_REQUESTS_PER_MINUTE` and
 *    observed by `observingFetch`; `afterAll` fails the run if any response was
 *    a rate limit. A run therefore takes about a minute or longer by design.
 */

import { afterAll, describe, expect, inject, it } from "vitest";
import { NovaraFlexApiError, NovaraFlexClient } from "../../src/index.js";

const live = inject("novaraFlex");

/** A token that is well-formed but cannot possibly be valid. */
const INVALID_TOKEN = "invalid-token-for-live-validation";

/**
 * The live suite's request budget. The vendor allows roughly 80 requests a
 * minute, but that pool is shared by every token and integration on the
 * account, including whatever else the account runs, so a live run stays
 * at half of it and leaves headroom, following the SDK's own README
 * recommendation for the `rateLimit` option.
 */
const LIVE_REQUESTS_PER_MINUTE = 40;

/** What `observingFetch` records about a rate-limited response: no live values. */
interface RateLimitHit {
  /** The vendor method, the last path segment of the request URL. */
  method: string;
  /** The HTTP status. */
  status: number;
  /** Whether a `Retry-After` header was present; its value is not recorded. */
  retryAfter: boolean;
}

const rateLimitHits: RateLimitHit[] = [];

/** The vendor method a request addressed: the last path segment of its URL. */
function methodOf(input: Parameters<typeof globalThis.fetch>[0]): string {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(url).pathname.split("/").pop() ?? "";
}

/**
 * `globalThis.fetch`, watched for rate limits: an HTTP 429, or a JSON body
 * that is an `ok: false` / `rate_limit_exceeded` envelope. It records only the
 * method, the status, and whether `Retry-After` was present, parses a clone so
 * the SDK still reads the original, ignores a body that is not JSON, and
 * returns the response untouched.
 */
const observingFetch: typeof globalThis.fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init);
  const hit = (): void => {
    rateLimitHits.push({
      method: methodOf(input),
      status: response.status,
      retryAfter: response.headers.has("retry-after"),
    });
  };
  if (response.status === 429) {
    hit();
  } else {
    try {
      const body: unknown = await response.clone().json();
      if (
        typeof body === "object" &&
        body !== null &&
        (body as { ok?: unknown }).ok === false &&
        (body as { error?: unknown }).error === "rate_limit_exceeded"
      ) {
        hit();
      }
    } catch {
      // Not JSON (or the body failed to arrive): not a rate-limit envelope.
    }
  }
  return response;
};

/**
 * Build a client pointed at the configured environment. Every client is
 * throttled to `LIVE_REQUESTS_PER_MINUTE` and watched by `observingFetch`.
 */
function createClient(token: string): NovaraFlexClient {
  return new NovaraFlexClient({
    token,
    fetch: observingFetch,
    rateLimit: { requestsPerMinute: LIVE_REQUESTS_PER_MINUTE },
    // `exactOptionalPropertyTypes`: omit the key rather than pass undefined.
    ...(live.baseUrl !== undefined ? { baseUrl: live.baseUrl } : {}),
  });
}

// The SDK waits out a rate limit once and then holds every call for a
// cooldown, so without this check a rate limit would be absorbed silently and
// only make the run about 60 s slower — exactly what went unexplained on
// 2026-09-30. Fail loudly instead. The message carries no live values.
afterAll(() => {
  const shapes = rateLimitHits
    .map(
      (h) =>
        `${h.method}: HTTP ${h.status}, Retry-After ${h.retryAfter ? "present" : "absent"}`,
    )
    .join("; ");
  expect(
    rateLimitHits.length,
    `The live suite tripped the vendor rate limit (${shapes}). This shape is the first live observation of a rate limit: record it in docs/live-validation.md.`,
  ).toBe(0);
});

const flex = createClient(live.token);

/** A predicate over one JSON value. Predicates keep values out of failures. */
type TypeCheck = (value: unknown) => boolean;

const isString: TypeCheck = (v) => typeof v === "string";
const isBoolean: TypeCheck = (v) => typeof v === "boolean";
const isInteger: TypeCheck = (v) =>
  typeof v === "number" && Number.isInteger(v);
/** The contract's `number`: a compliance score may carry a fraction. */
const isNumber: TypeCheck = (v) => typeof v === "number" && Number.isFinite(v);
const isNullableString: TypeCheck = (v) => v === null || typeof v === "string";
const isNullableInteger: TypeCheck = (v) => v === null || isInteger(v);
const isNullableNumber: TypeCheck = (v) => v === null || isNumber(v);
const isStringOrInteger: TypeCheck = (v) => isString(v) || isInteger(v);
const isNullableStringOrInteger: TypeCheck = (v) =>
  v === null || isStringOrInteger(v);
const isPlainObject: TypeCheck = (v) =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStringArray: TypeCheck = (v) => Array.isArray(v) && v.every(isString);
const isIntegerArray: TypeCheck = (v) => Array.isArray(v) && v.every(isInteger);
const isObjectArray: TypeCheck = (v) =>
  Array.isArray(v) && v.every(isPlainObject);
const isArray: TypeCheck = (v) => Array.isArray(v);

/** A predicate for a contract enum of string values. */
function isOneOf(allowed: readonly string[]): TypeCheck {
  return (v) => typeof v === "string" && allowed.includes(v);
}

/** The inspection status enum shared by `Equipment` and `EquipmentScheduleStatus`. */
const INSPECTION_STATUSES = ["uptodate", "expiring", "expired"] as const;
const isInspectionStatus = isOneOf(INSPECTION_STATUSES);

/**
 * The success body a namespace method resolves to. Every item type below is
 * derived from the public API this way — never from `src/generated` or
 * `src/internal` — so the tables are checked against what consumers see.
 */
type ResultOf<F> = F extends (...args: never[]) => Promise<infer R> ? R : never;

/** One element of an array-valued (possibly optional) property. */
type ElementOf<A> = NonNullable<A> extends readonly (infer E)[] ? E : never;

/** The declared keys of `T`, with the open index signature dropped. */
type DeclaredKeys<T> = keyof {
  [K in keyof T as string extends K
    ? never
    : number extends K
      ? never
      : K]: unknown;
} &
  string;

/** The declared keys of `T` that the contract marks required. */
type RequiredKeys<T> = {
  [K in DeclaredKeys<T>]-?: Partial<Pick<T, K>> extends Pick<T, K> ? never : K;
}[DeclaredKeys<T>];

/**
 * `unknown` when `Listed` names every required key in `All`; otherwise an
 * object type naming the missing ones, which no array literal satisfies.
 */
type NamesEveryRequiredKey<All, Listed> = [Exclude<All, Listed>] extends [never]
  ? unknown
  : { readonly "required keys missing from this list": Exclude<All, Listed> };

/**
 * One contract shape as the live suite checks it: the keys the contract marks
 * required, and a type predicate for every declared key worth checking.
 */
interface FieldTable {
  readonly required: readonly string[];
  readonly checks: Readonly<Partial<Record<string, TypeCheck>>>;
}

/**
 * Build the {@link FieldTable} for the public response type `T`. The compiler
 * checks the `required` list against `T` in both directions — every listed key
 * is required in `T`, and every key `T` requires is listed — so a contract
 * change that adds or drops a `required` entry fails `pnpm typecheck` until the
 * table follows. `checks` may name only keys `T` declares; a required key the
 * contract leaves untyped (such as a `signature`) is listed but not checked.
 */
function fieldTable<T>() {
  return <const R extends readonly RequiredKeys<T>[]>(
    required: R & NamesEveryRequiredKey<RequiredKeys<T>, R[number]>,
    checks: { readonly [K in DeclaredKeys<T>]?: TypeCheck },
  ): FieldTable => ({ required, checks });
}

/**
 * `unknown` when `Listed` names every member of the union `All`; otherwise an
 * object type naming the missing ones, which no array literal satisfies.
 */
type NamesEveryMember<All, Listed> = [Exclude<All, Listed>] extends [never]
  ? unknown
  : { readonly "union members missing from this list": Exclude<All, Listed> };

/**
 * List every member of the string union `T`. The compiler checks the list in
 * both directions — every entry is a member, and every member is listed — so a
 * contract enum that gains or loses a value fails `pnpm typecheck` until the
 * list follows.
 */
function unionMembers<T extends string>() {
  return <const L extends readonly T[]>(
    list: L & NamesEveryMember<T, L[number]>,
  ): readonly T[] => list;
}

/*
 * The public response types each table below is checked against, derived
 * from the client's namespace methods.
 */
type Client = NovaraFlexClient;
type User = ElementOf<ResultOf<Client["users"]["list"]>["users"]>;
type Project = ElementOf<ResultOf<Client["projects"]["list"]>["projects"]>;
type Account = ResultOf<Client["account"]["info"]>["account"];
type AccountMetafield = ElementOf<Account["userMetafields"]>;
type Role = ElementOf<ResultOf<Client["roles"]["list"]>["roles"]>;
type JobTitle = ElementOf<ResultOf<Client["jobtitles"]["list"]>["jobtitles"]>;
type FieldOffice = ElementOf<
  ResultOf<Client["fieldoffices"]["list"]>["fieldoffices"]
>;
type LineOfBusiness = ElementOf<
  ResultOf<Client["linesofbusiness"]["list"]>["linesofbusiness"]
>;
type Company = ElementOf<ResultOf<Client["companies"]["list"]>["companies"]>;
type Equipment = ElementOf<
  ResultOf<Client["equipments"]["list"]>["equipments"]
>;
type EquipmentScheduleStatus = ElementOf<Equipment["schedules"]>;
type EquipmentProject = ElementOf<Equipment["projects"]>;
type EquipmentType = ElementOf<
  ResultOf<Client["equipmenttypes"]["list"]>["equipmenttypes"]
>;
type EquipmentMetafield = ElementOf<EquipmentType["metafields"]>;
type EquipmentTypeSchedule = ElementOf<EquipmentType["schedules"]>;
type EquipmentScheduleTrigger = NonNullable<EquipmentTypeSchedule["trigger"]>;
type Contractor = ElementOf<
  ResultOf<Client["contractors"]["list"]>["contractors"]
>;
type ContractorContact = ElementOf<
  ResultOf<Client["contractorContacts"]["list"]>["contacts"]
>;
type ContractorRequirement = ElementOf<
  ResultOf<Client["contractorRequirements"]["list"]>["requirements"]
>;
type RequirementContractor = ElementOf<
  ResultOf<Client["contractorRequirements"]["info"]>["contractors"]
>;
type FormFolder = ElementOf<ResultOf<Client["formfolders"]["list"]>["folders"]>;
type FormSummary = ElementOf<ResultOf<Client["forms"]["list"]>["forms"]>;
type FormDetail = ResultOf<Client["forms"]["info"]>["form"];
type FormVersion = FormDetail["latest"];
type FormField = ElementOf<FormVersion["fields"]>;
/** The `settings` of the `FormField` variant whose `type` is `T`. */
type FormFieldSettings<T extends FormField["type"]> = Extract<
  FormField,
  { type: T }
>["settings"];
type FormFieldSelectOption = ElementOf<FormFieldSettings<"select">["items"]>;
type FormFieldAutoPopulateData = NonNullable<
  FormFieldSettings<"text">["autoPopulateData"]
>;
type FormFieldImageKey = ElementOf<
  FormFieldSettings<"description">["imageKeys"]
>;
type FormFieldSketchMark = ElementOf<FormFieldSettings<"sketch">["marks"]>;
type FormFieldSketchPoint = ElementOf<FormFieldSketchMark["points"]>;
type FormResponse = ElementOf<
  ResultOf<Client["responses"]["list"]>["responses"]
>;
type FormResponseRevision = NonNullable<FormResponse["latest"]>;
type ResponseLocation = NonNullable<FormResponseRevision["location"]>;
type ResponseWeather = FormResponseRevision["weather"];
type FormResponseAnswer = FormResponseRevision["responses"][string];
type ResponseAnswerAttachment = ElementOf<FormResponseAnswer["attachments"]>;
type ResponseFollowup = ElementOf<FormResponseAnswer["fups"]>;
type Followup = ElementOf<ResultOf<Client["followups"]["list"]>["followups"]>;
type FollowupMessage = ElementOf<Followup["messages"]>;
type FollowupAttachment = ElementOf<FollowupMessage["attachments"]>;
type Inspection = ElementOf<
  ResultOf<Client["inspections"]["list"]>["inspections"]
>;
type Acknowledgment = ElementOf<
  ResultOf<Client["acknowledgments"]["list"]>["acknowledgments"]
>;
type AcknowledgmentRecipient = ElementOf<Acknowledgment["recipients"]>;
type Training = ElementOf<ResultOf<Client["trainings"]["list"]>["trainings"]>;
type TrainingAssignmentCondition = Training["assigned_to_condition"];
type TrainingAssignmentConditionData = NonNullable<
  TrainingAssignmentCondition["data"]
>;
type CompletedTraining = ElementOf<
  ResultOf<Client["completedtrainings"]["list"]>["completedtrainings"]
>;
type GroupTraining = ElementOf<
  ResultOf<Client["grouptrainings"]["list"]>["grouptrainings"]
>;
type TrainingEmployeeStatus = ElementOf<
  ResultOf<Client["trainingEmployeeStatus"]["list"]>["employees"]
>;
type TrainingCompletionStatus = ElementOf<
  TrainingEmployeeStatus["last_completed"]
>;
type DriverQualificationUser = ElementOf<
  ResultOf<Client["driverQualifications"]["list"]>["users"]
>;
type DriverQualificationRequirement = ElementOf<
  DriverQualificationUser["requirements"]
>;
type OshaHoursEntry = ElementOf<ResultOf<Client["oshaHours"]["list"]>["hours"]>;
type Establishment = ElementOf<
  ResultOf<Client["establishments"]["list"]>["establishments"]
>;
type DataList = ElementOf<ResultOf<Client["datalists"]["list"]>["datalists"]>;
type DataListItem = ElementOf<
  ResultOf<Client["datalistitems"]["list"]>["datalistitems"]
>;
type Resource = ElementOf<ResultOf<Client["resources"]["list"]>["resources"]>;
type ResourceVersion = ElementOf<Resource["versions"]>;
type ResourceCategory = ElementOf<
  ResultOf<Client["resourcetags"]["list"]>["resourcetags"]
>;

/**
 * Assert that `record` carries every key the contract marks required, and
 * that every checked field, *when present*, matches the type the contract
 * declares for it. Optional fields that are absent are skipped: an account
 * simply may not populate them. A required key that is absent fails the run.
 *
 * Only the label and the field name reach a failure message — never a value.
 */
function expectContractTypes(
  record: Record<string, unknown>,
  table: FieldTable,
  label: string,
): void {
  for (const field of table.required) {
    expect(
      field in record,
      `${label}.${field} is required by the contract but absent`,
    ).toBe(true);
  }
  for (const [field, check] of Object.entries(table.checks)) {
    if (check === undefined || !(field in record)) continue;
    expect(
      check(record[field]),
      `${label}.${field} does not match the type declared in the contract`,
    ).toBe(true);
  }
}

/** The `User` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const USER_FIELDS = fieldTable<User>()(
  [
    "created",
    "fieldOffice_id",
    "lineOfBusiness_id",
    "clients_id",
    "projects_id",
    "firstname",
    "lastname",
    "employeeNumber",
    "email",
    "username",
    "isDriver",
    "isRegulatedDriver",
    "role_id",
    "id",
  ],
  {
    id: isString,
    firstname: isString,
    lastname: isString,
    email: isString,
    username: isString,
    employeeNumber: isString,
    cellPhone: isString,
    emergencyContact: isString,
    hse_id: isString,
    jobTitle_id: isString,
    manager_id: isString,
    mentor_id: isString,
    role_id: isString,
    supervisor_id: isString,
    created: isInteger,
    registered_on: isInteger,
    hireDate: isInteger,
    sseDate: isInteger,
    terminationDate: isInteger,
    lastWebAccess: isInteger,
    lastMobileAccess: isInteger,
    isDriver: isBoolean,
    isRegulatedDriver: isBoolean,
    clients_id: isStringArray,
    fieldOffice_id: isStringArray,
    lineOfBusiness_id: isStringArray,
    projects_id: isStringArray,
    creator_id: isPlainObject,
    metavalues: isPlainObject,
  },
);

/** The `Project` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const PROJECT_FIELDS = fieldTable<Project>()(
  [
    "id",
    "created",
    "updated",
    "deleted",
    "name",
    "number",
    "address",
    "city",
    "state",
    "zip",
    "active",
    "notes",
    "attachments",
  ],
  {
    id: isInteger,
    name: isString,
    number: isString,
    created: isStringOrInteger,
    updated: isStringOrInteger,
    address: isNullableString,
    city: isNullableString,
    state: isNullableString,
    zip: isNullableString,
    notes: isNullableString,
    active: isBoolean,
    deleted: isBoolean,
    attachments: isObjectArray,
  },
);

/** The `Account` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const ACCOUNT_FIELDS = fieldTable<Account>()(["id", "name"], {
  id: isString,
  name: isString,
  subdomain: isString,
  created: isInteger,
  expiresOn: isInteger,
  userMetafields: isObjectArray,
});

/** An item of `Account.userMetafields`. */
const ACCOUNT_METAFIELD_FIELDS = fieldTable<AccountMetafield>()(
  ["id", "name", "type", "list_id"],
  {
    id: isString,
    name: isString,
    type: isString,
    list_id: isNullableInteger,
  },
);

/** The `Role` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const ROLE_FIELDS = fieldTable<Role>()(["name", "id"], {
  id: isString,
  name: isString,
});

/** The `JobTitle` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const JOB_TITLE_FIELDS = fieldTable<JobTitle>()([], {
  id: isString,
  title: isString,
  created: isInteger,
});

/** The `FieldOffice` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const FIELD_OFFICE_FIELDS = fieldTable<FieldOffice>()(
  ["name", "code", "created", "id", "inactive"],
  {
    id: isString,
    name: isString,
    code: isString,
    manager_id: isString,
    created: isInteger,
    inactive: isBoolean,
  },
);

/** The `LineOfBusiness` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const LINE_OF_BUSINESS_FIELDS = fieldTable<LineOfBusiness>()(["name", "id"], {
  id: isString,
  name: isString,
  code: isString,
  created: isInteger,
});

/** The `Company` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const COMPANY_FIELDS = fieldTable<Company>()(["name", "id"], {
  id: isString,
  name: isString,
  created: isInteger,
});

/**
 * The `EquipmentScheduleStatus` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * The three dates are nullable because the vendor's docs example shows null
 * for a schedule that has never been completed.
 */
const EQUIPMENT_SCHEDULE_STATUS_FIELDS = fieldTable<EquipmentScheduleStatus>()(
  [],
  {
    schedule_id: isString,
    status: isInspectionStatus,
    expiresOn: isNullableInteger,
    expiringOn: isNullableInteger,
    lastCompletedOn: isNullableInteger,
  },
);

/** The `Equipment` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const EQUIPMENT_FIELDS = fieldTable<Equipment>()(
  [
    "id",
    "serialNumber",
    "equipmentType_id",
    "created",
    "clients_id",
    "assignedUsers_id",
    "title",
    "notes",
    "isInService",
    "metavalues",
    "projects",
  ],
  {
    id: isString,
    serialNumber: isString,
    equipmentType_id: isString,
    created: isInteger,
    parent_id: isString,
    fieldOffice_id: isStringArray,
    lineOfBusiness_id: isString,
    clients_id: isStringArray,
    assignedUsers_id: isStringArray,
    title: isString,
    notes: isString,
    isInService: isBoolean,
    metavalues: isPlainObject,
    status: isInspectionStatus,
    schedules: isObjectArray,
    projects: isObjectArray,
  },
);

/** An item of `Equipment.projects`, declared inline in the contract. */
const EQUIPMENT_PROJECT_FIELDS = fieldTable<EquipmentProject>()(
  ["id", "name"],
  {
    id: isInteger,
    name: isString,
  },
);

/**
 * The `EquipmentMetafield` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * `list_id` is null for a metafield that is not backed by a list — observed on
 * the wire 2026-09-14, which is why the contract declares it nullable.
 */
const EQUIPMENT_METAFIELD_FIELDS = fieldTable<EquipmentMetafield>()(
  ["id", "name", "type", "list_id"],
  {
    id: isString,
    name: isString,
    type: isString,
    list_id: isNullableInteger,
  },
);

/** The `EquipmentType` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const EQUIPMENT_TYPE_FIELDS = fieldTable<EquipmentType>()(
  ["id", "title", "created", "metafields", "schedules"],
  {
    id: isString,
    title: isString,
    created: isInteger,
    metafields: isObjectArray,
    schedules: isObjectArray,
  },
);

/**
 * The `EquipmentTypeSchedule` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 * Never observed on the wire, so it requires nothing.
 */
const EQUIPMENT_TYPE_SCHEDULE_FIELDS = fieldTable<EquipmentTypeSchedule>()([], {
  id: isString,
  name: isString,
  form_id: isInteger,
  instructions: isString,
  doRequireAttachments: isBoolean,
  trigger: isPlainObject,
});

/**
 * The `EquipmentScheduleTrigger` schema of
 * `openapi/novara-flex-openapi-3.1.yaml`. Never observed on the wire.
 */
const EQUIPMENT_SCHEDULE_TRIGGER_FIELDS =
  fieldTable<EquipmentScheduleTrigger>()([], {
    type: isString,
    timing: isString,
    expiringPeriodInDays: isInteger,
    frequencyInDays: isInteger,
    timingDateNumber: isInteger,
  });

/**
 * The `Contractor` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * The two compliance scores are `number`, not `integer`, so they are checked
 * with {@link isNumber}: a percentage may well arrive with a fraction.
 */
const CONTRACTOR_FIELDS = fieldTable<Contractor>()([], {
  id: isString,
  name: isString,
  address: isString,
  city: isString,
  state: isString,
  zip: isString,
  approval_status: isString,
  contractor_compliance_score: isNumber,
  employee_compliance_score: isNumber,
  tags: isString,
  auto_approve: isBoolean,
});

/** The `ContractorContact` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const CONTRACTOR_CONTACT_FIELDS = fieldTable<ContractorContact>()([], {
  id: isString,
  firstname: isString,
  lastname: isString,
  email: isString,
  phone: isString,
  title: isString,
  mine: isBoolean,
});

/** The `ContractorRequirement` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const CONTRACTOR_REQUIREMENT_FIELDS = fieldTable<ContractorRequirement>()([], {
  id: isString,
  name: isString,
  type_id: isInteger,
  type: isString,
  isActive: isBoolean,
  compliance_scoring: isBoolean,
  recurring: isBoolean,
  vendor_count: isInteger,
  form_expiration_date: isBoolean,
  related_id: isString,
  description: isString,
});

/** A `contractor-requirement.info` entry of the inline `contractors` array. */
const REQUIREMENT_CONTRACTOR_FIELDS = fieldTable<RequirementContractor>()([], {
  contractor_id: isString,
  name: isString,
  status: isString,
});

/** The `FormFolder` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const FORM_FOLDER_FIELDS = fieldTable<FormFolder>()(
  ["id", "created", "updated", "sequence", "name"],
  {
    id: isInteger,
    created: isInteger,
    updated: isInteger,
    sequence: isInteger,
    name: isString,
  },
);

/**
 * The `FormSummary` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * `folder_id` is null for a form that is not filed in a folder — observed on
 * the wire 2026-09-19, which is why the contract declares it nullable.
 */
const FORM_SUMMARY_FIELDS = fieldTable<FormSummary>()(
  [
    "id",
    "created",
    "updated",
    "sequence",
    "folder_id",
    "name",
    "hidden",
    "description",
    "score",
  ],
  {
    id: isInteger,
    created: isInteger,
    updated: isInteger,
    sequence: isInteger,
    folder_id: isNullableInteger,
    name: isString,
    hidden: isBoolean,
    description: isString,
    score: isBoolean,
  },
);

/** The `FormDetail` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const FORM_DETAIL_FIELDS = fieldTable<FormDetail>()(
  [
    "id",
    "created",
    "updated",
    "sequence",
    "name",
    "hidden",
    "description",
    "score",
    "latest",
  ],
  {
    ...FORM_SUMMARY_FIELDS.checks,
    latest: isPlainObject,
    versions: isObjectArray,
  },
);

/** The `FormVersion` schema: `FormDetail.latest` and each `versions` entry. */
const FORM_VERSION_FIELDS = fieldTable<FormVersion>()(["version", "fields"], {
  version: isInteger,
  created: isInteger,
  m_user_id: isString,
  fields: isObjectArray,
});

/**
 * Every `type` of the contract's `FormField` discriminated union. A
 * field whose type is not listed here fails the run: the union is closed.
 */
const FORM_FIELD_TYPES = unionMembers<FormField["type"]>()([
  "attachments",
  "calculation",
  "checkbox",
  "counter",
  "datetime",
  "description",
  "followup",
  "groupsignature",
  "heading",
  "select",
  "sketch",
  "subreport",
  "text",
]);

/** The properties every `FormField` variant shares, and its discriminant. */
const FORM_FIELD_FIELDS = fieldTable<FormField>()(
  ["id", "title", "shortTitle", "required", "type", "description", "settings"],
  {
    id: isString,
    title: isString,
    shortTitle: isString,
    type: isOneOf(FORM_FIELD_TYPES),
    description: isString,
    required: isBoolean,
    settings: isPlainObject,
  },
);

/** The `FormFieldSelectOption` schema: an inline option of a select field. */
const FORM_FIELD_SELECT_OPTION_FIELDS = fieldTable<FormFieldSelectOption>()(
  ["label", "value", "score"],
  {
    label: isString,
    value: isString,
    score: isNullableNumber,
    color: isString,
    inactive: isBoolean,
  },
);

/** The `FormFieldAutoPopulateData` schema of select and text settings. */
const FORM_FIELD_AUTO_POPULATE_FIELDS = fieldTable<FormFieldAutoPopulateData>()(
  ["parentId", "value"],
  { parentId: isString, value: isString },
);

/** An item of `FormFieldDescriptionSettings.imageKeys`. */
const FORM_FIELD_IMAGE_KEY_FIELDS = fieldTable<FormFieldImageKey>()(["key"], {
  key: isString,
});

/** The `FormFieldSketchMark` schema: one stroke of a sketch field. */
const FORM_FIELD_SKETCH_MARK_FIELDS = fieldTable<FormFieldSketchMark>()(
  ["type", "color", "points"],
  { type: isString, color: isString, points: isObjectArray },
);

/** A point of `FormFieldSketchMark.points`. */
const FORM_FIELD_SKETCH_POINT_FIELDS = fieldTable<FormFieldSketchPoint>()(
  ["x", "y"],
  { x: isNumber, y: isNumber },
);

/**
 * The `settings` of each `FormField` variant, keyed by `type`. The mapped key
 * type makes the compiler demand a table for every member of the union. The
 * rare types (and `heading`, which carries no settings key) have open settings,
 * so their tables require and check nothing.
 */
const FORM_FIELD_SETTINGS_FIELDS: {
  readonly [T in FormField["type"]]: FieldTable;
} = {
  attachments: fieldTable<FormFieldSettings<"attachments">>()([], {
    visibility: isString,
    camera: isBoolean,
    attachmentMethod: isString,
    resourceTags: isString,
    fileTypes: isString,
  }),
  calculation: fieldTable<FormFieldSettings<"calculation">>()([], {}),
  checkbox: fieldTable<FormFieldSettings<"checkbox">>()(["inputtype"], {
    inputtype: isString,
    category: isString,
    defaulted: isBoolean,
  }),
  counter: fieldTable<FormFieldSettings<"counter">>()([], {}),
  datetime: fieldTable<FormFieldSettings<"datetime">>()(["date"], {
    date: isBoolean,
    time: isBoolean,
    military: isBoolean,
    punchclock: isBoolean,
    locate: isBoolean,
  }),
  description: fieldTable<FormFieldSettings<"description">>()(["description"], {
    description: isString,
    imageKeys: isObjectArray,
    showOnOutput: isBoolean,
  }),
  followup: fieldTable<FormFieldSettings<"followup">>()([], {}),
  groupsignature: fieldTable<FormFieldSettings<"groupsignature">>()(
    ["scan", "pinToProfile", "preFilterIds", "preFilterRoles", "hideIds"],
    {
      scan: isBoolean,
      pinToProfile: isBoolean,
      preFilterIds: isArray,
      preFilterRoles: isArray,
      hideIds: isArray,
    },
  ),
  heading: fieldTable<FormFieldSettings<"heading">>()([], {}),
  select: fieldTable<FormFieldSettings<"select">>()(
    ["style", "multiple", "items"],
    {
      style: isString,
      multiple: isBoolean,
      items: isObjectArray,
      sourceId: isStringOrInteger,
      previewId: isString,
      filterCondition: isString,
      defaultIds: isStringArray,
      tags: isStringArray,
      preFilterIds: isStringArray,
      autoPopulateIds: isStringArray,
      autoPopulateData: isPlainObject,
      hideIds: isArray,
      scan: isBoolean,
      onlyScan: isBoolean,
      showAllOnOutput: isBoolean,
      pinToProfile: isBoolean,
      previewOnResponse: isBoolean,
      showOmitted: isBoolean,
      showInFilter: isBoolean,
    },
  ),
  sketch: fieldTable<FormFieldSettings<"sketch">>()([], {
    bg: isString,
    marks: isObjectArray,
  }),
  subreport: fieldTable<FormFieldSettings<"subreport">>()([], {}),
  text: fieldTable<FormFieldSettings<"text">>()(["texttype"], {
    texttype: isString,
    keyboardtype: isString,
    default: isString,
    sourceId: isString,
    autoPopulateData: isPlainObject,
    items: isArray,
  }),
};

/**
 * The typed structures nested in a variant's `settings`, by `type` and then by
 * settings key. An array value is checked item by item.
 */
const FORM_FIELD_SETTINGS_NESTED: {
  readonly [T in FormField["type"]]?: Readonly<Record<string, FieldTable>>;
} = {
  description: { imageKeys: FORM_FIELD_IMAGE_KEY_FIELDS },
  select: {
    items: FORM_FIELD_SELECT_OPTION_FIELDS,
    autoPopulateData: FORM_FIELD_AUTO_POPULATE_FIELDS,
  },
  sketch: { marks: FORM_FIELD_SKETCH_MARK_FIELDS },
  text: { autoPopulateData: FORM_FIELD_AUTO_POPULATE_FIELDS },
};

/**
 * The `FormResponse` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * `created` and `updated` arrive as epoch integers from `responses.list` but as
 * numeric strings from `responses.info` — observed on the wire 2026-09-19,
 * which is why the contract types them as string-or-integer.
 */
const FORM_RESPONSE_FIELDS = fieldTable<FormResponse>()(
  ["id", "created", "updated"],
  {
    id: isInteger,
    parent_response_id: isNullableInteger,
    pending_followup_assignees_id: isStringArray,
    created: isStringOrInteger,
    updated: isStringOrInteger,
    deleted: isBoolean,
    latest: isPlainObject,
    fups: isObjectArray,
  },
);

/**
 * The `FormResponseRevision` schema of `openapi/novara-flex-openapi-3.1.yaml`:
 * `latest` on `responses.info`, and on `responses.list` with `latest: true`.
 *
 * `location` is nullable: null was observed on the wire 2026-09-29 for a
 * response without a location, although the docs example shows an object.
 */
const FORM_RESPONSE_REVISION_FIELDS = fieldTable<FormResponseRevision>()(
  [
    "m_completer_id",
    "m_submitter_id",
    "started_on",
    "submitted_on",
    "received_on",
    "version",
    "form_version",
    "location",
    "weather",
    "responses",
  ],
  {
    m_completer_id: isString,
    m_submitter_id: isString,
    started_on: isInteger,
    submitted_on: isInteger,
    received_on: isInteger,
    version: isInteger,
    form_version: isInteger,
    location: (v) => v === null || isPlainObject(v),
    weather: isPlainObject,
    responses: isPlainObject,
    fups: isObjectArray,
  },
);

/** The `ResponseLocation` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const RESPONSE_LOCATION_FIELDS = fieldTable<ResponseLocation>()(
  ["lon", "lat", "accuracy"],
  { lon: isNumber, lat: isNumber, accuracy: isNumber },
);

/**
 * The `ResponseWeather` schema of `openapi/novara-flex-openapi-3.1.yaml`. It
 * requires nothing: the wire sent an empty weather object on some responses.
 */
const RESPONSE_WEATHER_FIELDS = fieldTable<ResponseWeather>()([], {
  temperature: isNumber,
  icon: isString,
  windSpeed: isNumber,
});

/**
 * The `FormResponseAnswer` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 * `value` is listed but not checked: its shape depends on the field type, so
 * the contract leaves it untyped.
 */
const FORM_RESPONSE_ANSWER_FIELDS = fieldTable<FormResponseAnswer>()(
  ["value"],
  { attachments: isObjectArray, fups: isObjectArray },
);

/** An item of `FormResponseAnswer.attachments`. */
const RESPONSE_ANSWER_ATTACHMENT_FIELDS =
  fieldTable<ResponseAnswerAttachment>()(["key"], {
    key: isString,
    caption: isString,
  });

/**
 * The `ResponseFollowup` schema of `openapi/novara-flex-openapi-3.1.yaml`: a
 * follow-up embedded in a response. Unlike `followups.list`, the wire sends its
 * timestamps and its `followup_display_id` as integers.
 */
const RESPONSE_FOLLOWUP_FIELDS = fieldTable<ResponseFollowup>()(
  [
    "id",
    "open",
    "due",
    "created_on",
    "updated_on",
    "resolved_on",
    "m_observer_id",
    "m_assigner_id",
    "m_assignee_id",
    "m_completer_id",
    "messages",
  ],
  {
    id: isString,
    open: isBoolean,
    due: isNullableInteger,
    created_on: isInteger,
    updated_on: isInteger,
    resolved_on: isNullableStringOrInteger,
    m_observer_id: isString,
    m_assigner_id: isString,
    m_assignee_id: isString,
    m_completer_id: isNullableString,
    followup_display_id: isInteger,
    messages: isObjectArray,
  },
);

/**
 * The `Followup` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * The three fields an open follow-up has not filled in yet — `due`,
 * `resolved_on`, and `m_completer_id` — arrive as null, and the timestamps
 * arrive as numeric strings. Both were observed on the wire 2026-09-19 and the
 * contract now says so.
 */
const FOLLOWUP_FIELDS = fieldTable<Followup>()(
  [
    "id",
    "form_id",
    "response_id",
    "open",
    "created_on",
    "updated_on",
    "m_observer_id",
    "m_assigner_id",
    "m_assignee_id",
    "due",
    "resolved_on",
    "m_completer_id",
    "messages",
  ],
  {
    id: isString,
    form_id: isInteger,
    response_id: isInteger,
    open: isBoolean,
    created_on: isStringOrInteger,
    updated_on: isStringOrInteger,
    m_observer_id: isString,
    m_assigner_id: isString,
    m_assignee_id: isString,
    due: isNullableInteger,
    resolved_on: isNullableStringOrInteger,
    m_completer_id: isNullableString,
    followup_display_id: isString,
    messages: isObjectArray,
  },
);

/**
 * The `FollowupMessage` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * `signature` is deliberately absent: the contract leaves it untyped (`{}`),
 * so there is nothing to check it against.
 */
const FOLLOWUP_MESSAGE_FIELDS = fieldTable<FollowupMessage>()(
  ["id", "date", "m_user_id", "note"],
  {
    id: isString,
    date: isInteger,
    m_user_id: isString,
    m_reassignee_id: isNullableString,
    note: isString,
    attachments: isObjectArray,
    notify: isBoolean,
  },
);

/** An item of `FollowupMessage.attachments`. */
const FOLLOWUP_ATTACHMENT_FIELDS = fieldTable<FollowupAttachment>()(["key"], {
  key: isString,
  caption: isString,
});

/** The `Inspection` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const INSPECTION_FIELDS = fieldTable<Inspection>()([], {
  id: isString,
  equipment_id: isString,
  equipmentType_id: isString,
  schedule_id: isString,
  inspector_id: isString,
  date: isInteger,
  created: isInteger,
  notes: isString,
});

/** The `Acknowledgment` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const ACKNOWLEDGMENT_FIELDS = fieldTable<Acknowledgment>()(["id", "name"], {
  id: isString,
  name: isString,
  created: isInteger,
  author_id: isString,
  specificEmployees_id: isStringArray,
  fieldOffices_id: isStringArray,
  linesOfBusiness_id: isStringArray,
  jobTitles_id: isStringArray,
  recipients: isObjectArray,
});

/**
 * The `AcknowledgmentRecipient` schema of
 * `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * `acknowledgedOn` is null until that employee acknowledges, which is why the
 * contract declares it nullable.
 */
const ACKNOWLEDGMENT_RECIPIENT_FIELDS = fieldTable<AcknowledgmentRecipient>()(
  [],
  {
    user_id: isString,
    acknowledgedOn: isNullableInteger,
  },
);

/**
 * The `Training` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * `expiring_days` is nullable: null was observed on the wire 2026-09-29.
 */
const TRAINING_FIELDS = fieldTable<Training>()(
  [
    "id",
    "title",
    "created",
    "lesson_id",
    "included_trainings_id",
    "schedule_type",
    "renewal_months",
    "certificate_text",
    "assigned_to_type",
    "assigned_to_condition",
    "is_highlighted",
    "notes",
    "expires_on_month",
    "expires_on_day",
    "expiring_days",
    "window_open_month",
    "window_open_day",
    "window_close_month",
    "window_close_day",
    "window_last_offered_date_number",
    "window_required_for_new_employees",
  ],
  {
    id: isInteger,
    title: isString,
    created: isInteger,
    lesson_id: isNullableInteger,
    included_trainings_id: isIntegerArray,
    schedule_type: isString,
    renewal_months: isNullableInteger,
    certificate_text: isString,
    assigned_to_type: isString,
    assigned_to_condition: isPlainObject,
    is_highlighted: isBoolean,
    notes: isString,
    expires_on_month: isNullableInteger,
    expires_on_day: isNullableInteger,
    expiring_days: isNullableInteger,
    window_open_month: isNullableInteger,
    window_open_day: isNullableInteger,
    window_close_month: isNullableInteger,
    window_close_day: isNullableInteger,
    window_last_offered_date_number: isNullableInteger,
    window_required_for_new_employees: isBoolean,
  },
);

/**
 * The `TrainingAssignmentCondition` schema of
 * `openapi/novara-flex-openapi-3.1.yaml`. Its `data` is not yet observed on the
 * wire, so it requires nothing.
 */
const TRAINING_ASSIGNMENT_CONDITION_FIELDS =
  fieldTable<TrainingAssignmentCondition>()([], { data: isPlainObject });

/**
 * The `TrainingAssignmentConditionData` schema of
 * `openapi/novara-flex-openapi-3.1.yaml`. Never observed on the wire.
 */
const TRAINING_ASSIGNMENT_CONDITION_DATA_FIELDS =
  fieldTable<TrainingAssignmentConditionData>()([], {
    fieldId: isString,
    settings: isPlainObject,
  });

/**
 * The `CompletedTraining` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * `signature` has no type check: the contract leaves it untyped (`{}`), the way
 * it does for a follow-up message signature, so there is nothing to check it
 * against. It is still in the required list, so its presence is checked. `notes`
 * is nullable: null was observed on the wire 2026-09-29.
 */
const COMPLETED_TRAINING_FIELDS = fieldTable<CompletedTraining>()(
  [
    "id",
    "training_id",
    "m_user_id",
    "created",
    "date_number",
    "special_expiration_date_number",
    "m_instructor_id",
    "group_training_id",
    "notes",
    "signature",
    "files",
  ],
  {
    id: isInteger,
    training_id: isInteger,
    m_user_id: isString,
    created: isInteger,
    date_number: isInteger,
    special_expiration_date_number: isNullableInteger,
    m_instructor_id: isNullableString,
    group_training_id: isNullableInteger,
    notes: isNullableString,
    files: isObjectArray,
  },
);

/** The `GroupTraining` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const GROUP_TRAINING_FIELDS = fieldTable<GroupTraining>()(
  [
    "id",
    "created",
    "m_trainees_id",
    "trainings_id",
    "m_instructor_id",
    "notes",
  ],
  {
    id: isInteger,
    created: isInteger,
    m_trainees_id: isStringArray,
    trainings_id: isIntegerArray,
    m_instructor_id: isString,
    notes: isString,
  },
);

/** The status enum of `TrainingEmployeeStatus`. */
const TRAINING_STATUSES = [
  "incomplete",
  "expiring",
  "active",
  "unassigned",
] as const;

/**
 * The `TrainingEmployeeStatus` schema of
 * `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * `percent_complete` is the contract's `number`, not `integer`: a partial
 * completion may well arrive with a fraction.
 */
const TRAINING_EMPLOYEE_STATUS_FIELDS = fieldTable<TrainingEmployeeStatus>()(
  [
    "status",
    "m_user_id",
    "percent_complete",
    "incomplete_training_ids",
    "complete_training_ids",
    "last_completed",
  ],
  {
    status: isOneOf(TRAINING_STATUSES),
    m_user_id: isString,
    percent_complete: isNumber,
    incomplete_training_ids: isIntegerArray,
    complete_training_ids: isIntegerArray,
    last_completed: isObjectArray,
  },
);

/**
 * The `TrainingCompletionStatus` schema of
 * `openapi/novara-flex-openapi-3.1.yaml`, an item of `last_completed`.
 */
const TRAINING_COMPLETION_STATUS_FIELDS =
  fieldTable<TrainingCompletionStatus>()([], {
    id: isInteger,
    date_number: isInteger,
    expiresOn: isNullableInteger,
    startsExpiringOn: isNullableInteger,
    is_required: isBoolean,
  });

/**
 * The `DriverQualificationUser` schema of
 * `openapi/novara-flex-openapi-3.1.yaml`.
 */
const DRIVER_QUALIFICATION_USER_FIELDS = fieldTable<DriverQualificationUser>()(
  [],
  {
    id: isString,
    employeeNumber: isString,
    requirements: isObjectArray,
  },
);

/**
 * The `DriverQualificationRequirement` schema of
 * `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * The two dates are declared as strings, not epoch integers — this is the one
 * area where the vendor formats them for display.
 */
const DRIVER_QUALIFICATION_REQUIREMENT_FIELDS =
  fieldTable<DriverQualificationRequirement>()([], {
    id: isInteger,
    title: isString,
    status: isString,
    expiration: isString,
    lastCompleted: isString,
  });

/**
 * The `OshaHoursEntry` schema of `openapi/novara-flex-openapi-3.1.yaml`.
 *
 * The vendor publishes no JSON example for `osha-hours.list`, so this schema was
 * written from the wire. `hours` is the contract's `number` rather than
 * `integer`, since a partial hour count is plausible. `client_id`, `fo_id`, and
 * `lob_id` are deliberately absent from this table: only null was ever observed
 * for them, so the contract leaves them untyped rather than guess.
 */
const OSHA_HOURS_ENTRY_FIELDS = fieldTable<OshaHoursEntry>()(
  ["id", "establishment_id", "year", "month", "hours"],
  {
    id: isInteger,
    establishment_id: isInteger,
    year: isInteger,
    month: isInteger,
    hours: isNumber,
  },
);

/** The `Establishment` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const ESTABLISHMENT_FIELDS = fieldTable<Establishment>()(["id", "name"], {
  id: isInteger,
  created: isInteger,
  updated: isInteger,
  name: isString,
  street: isString,
  city: isString,
  state: isString,
  zip: isString,
  industry_description: isString,
});

/** The `DataList` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const DATA_LIST_FIELDS = fieldTable<DataList>()(
  ["id", "created", "updated", "title"],
  {
    id: isInteger,
    created: isInteger,
    updated: isInteger,
    title: isString,
  },
);

/** The `DataListItem` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const DATA_LIST_ITEM_FIELDS = fieldTable<DataListItem>()(
  [
    "id",
    "created",
    "updated",
    "title",
    "data_list_id",
    "sequence",
    "code",
    "description",
  ],
  {
    id: isInteger,
    created: isInteger,
    updated: isInteger,
    title: isString,
    data_list_id: isInteger,
    sequence: isInteger,
    code: isString,
    description: isString,
  },
);

/** The `Resource` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const RESOURCE_FIELDS = fieldTable<Resource>()(
  [
    "title",
    "created",
    "sequence",
    "tags",
    "shouldBeAvailableOffline",
    "versions",
    "id",
  ],
  {
    id: isString,
    title: isString,
    created: isInteger,
    sequence: isInteger,
    category_id: isString,
    tags: isStringArray,
    shouldBeAvailableOffline: isBoolean,
    versions: isObjectArray,
  },
);

/** An item of `Resource.versions`, declared inline in the contract. */
const RESOURCE_VERSION_FIELDS = fieldTable<ResourceVersion>()(
  [
    "creator_id",
    "created",
    "approvedOn",
    "version",
    "description",
    "file",
    "type",
  ],
  {
    creator_id: isString,
    created: isInteger,
    approvedOn: isInteger,
    version: isString,
    description: isString,
    // Null when the version is a link rather than an uploaded document.
    file: isNullableString,
    link: isString,
    type: isString,
  },
);

/** The `ResourceCategory` schema of `openapi/novara-flex-openapi-3.1.yaml`. */
const RESOURCE_CATEGORY_FIELDS = fieldTable<ResourceCategory>()(
  ["name", "sequence", "roles_id"],
  {
    name: isString,
    sequence: isInteger,
    roles_id: isStringArray,
  },
);

/**
 * Assert the `paging` object the contract requires on every paged method's
 * success body, with integer `total` and `last_page`. Only the label reaches a
 * failure message.
 */
function expectPaging(
  body: Readonly<Record<string, unknown>>,
  label: string,
): void {
  expect(
    isPlainObject(body.paging),
    `${label} paging is required by the contract but absent or not an object`,
  ).toBe(true);
  const paging = body.paging as Record<string, unknown>;
  expect(
    isInteger(paging.total),
    `${label} paging.total does not match the type declared in the contract`,
  ).toBe(true);
  expect(
    isInteger(paging.last_page),
    `${label} paging.last_page does not match the type declared in the contract`,
  ).toBe(true);
}

/**
 * Assert that a `*.list` collection is an array of plain objects whose first
 * item matches the contract.
 *
 * An empty collection is acceptable — an account need not configure every
 * list — so the item checks are skipped in that case rather than failed.
 */
function expectContractItems(
  items: unknown,
  table: FieldTable,
  label: string,
): void {
  expect(Array.isArray(items), `${label} list is not an array`).toBe(true);
  const list = items as unknown[];
  expect(list.every(isPlainObject), `${label} list holds a non-object`).toBe(
    true,
  );

  const [first] = list;
  if (first === undefined) return;
  expectContractTypes(first as Record<string, unknown>, table, label);
}

/**
 * Assert the follow-ups embedded in a response (`fups`), and their messages,
 * against the contract. An absent `fups` is skipped: the contract makes every
 * `fups` optional. Only the label and a field name reach a failure message.
 */
function expectResponseFollowups(fups: unknown, label: string): void {
  if (fups === undefined) return;
  expect(isObjectArray(fups), `${label} is not an array of objects`).toBe(true);
  for (const followup of fups as Record<string, unknown>[]) {
    expectContractTypes(followup, RESPONSE_FOLLOWUP_FIELDS, `${label}[]`);
    if (!Array.isArray(followup.messages)) continue;
    for (const message of followup.messages) {
      expectContractTypes(
        message as Record<string, unknown>,
        FOLLOWUP_MESSAGE_FIELDS,
        `${label}[].messages[]`,
      );
    }
  }
}

/**
 * Assert a response's `latest` revision against the contract, down to every
 * answer, answer attachment, and embedded follow-up. An answer's `value` is
 * never inspected, and no field id — the answers' keys — reaches a failure
 * message, only the label and a field name of the contract.
 */
function expectRevision(latest: unknown, label: string): void {
  expect(isPlainObject(latest), `${label} is not an object`).toBe(true);
  const revision = latest as Record<string, unknown>;
  expectContractTypes(revision, FORM_RESPONSE_REVISION_FIELDS, label);
  if (isPlainObject(revision.location)) {
    expectContractTypes(
      revision.location as Record<string, unknown>,
      RESPONSE_LOCATION_FIELDS,
      `${label}.location`,
    );
  }
  if (isPlainObject(revision.weather)) {
    expectContractTypes(
      revision.weather as Record<string, unknown>,
      RESPONSE_WEATHER_FIELDS,
      `${label}.weather`,
    );
  }
  expectResponseFollowups(revision.fups, `${label}.fups`);

  if (!isPlainObject(revision.responses)) return;
  const answerLabel = `${label}.responses[field]`;
  for (const answer of Object.values(
    revision.responses as Record<string, unknown>,
  )) {
    expect(isPlainObject(answer), `${answerLabel} is not an object`).toBe(true);
    const fields = answer as Record<string, unknown>;
    expectContractTypes(fields, FORM_RESPONSE_ANSWER_FIELDS, answerLabel);
    if (Array.isArray(fields.attachments)) {
      for (const attachment of fields.attachments) {
        expectContractTypes(
          attachment as Record<string, unknown>,
          RESPONSE_ANSWER_ATTACHMENT_FIELDS,
          `${answerLabel}.attachments[]`,
        );
      }
    }
    expectResponseFollowups(fields.fups, `${answerLabel}.fups`);
  }
}

/**
 * Assert one `FormVersion` and every field in it against the `FormField`
 * union: the shared properties, a `type` inside the closed union, the typed
 * `settings` of that type, and the structures nested in them. Failures name
 * only the field type and the key — never a title, an option, or an id.
 */
function expectFormVersion(version: unknown, label: string): void {
  expect(isPlainObject(version), `${label} is not an object`).toBe(true);
  const record = version as Record<string, unknown>;
  expectContractTypes(record, FORM_VERSION_FIELDS, label);
  if (!Array.isArray(record.fields)) return;

  for (const field of record.fields as Record<string, unknown>[]) {
    expectContractTypes(field, FORM_FIELD_FIELDS, `${label}.fields[]`);
    const type = FORM_FIELD_TYPES.find((known) => known === field.type);
    if (type === undefined || !isPlainObject(field.settings)) continue;

    const settings = field.settings as Record<string, unknown>;
    const settingsLabel = `${label}.fields[type=${type}].settings`;
    expectContractTypes(
      settings,
      FORM_FIELD_SETTINGS_FIELDS[type],
      settingsLabel,
    );
    for (const [key, table] of Object.entries(
      FORM_FIELD_SETTINGS_NESTED[type] ?? {},
    )) {
      const value = settings[key];
      if (value === undefined) continue;
      const items: unknown[] = Array.isArray(value) ? value : [value];
      for (const item of items) {
        if (!isPlainObject(item)) continue;
        const entry = item as Record<string, unknown>;
        expectContractTypes(entry, table, `${settingsLabel}.${key}`);
        if (type !== "sketch" || !Array.isArray(entry.points)) continue;
        for (const point of entry.points as unknown[]) {
          if (!isPlainObject(point)) continue;
          expectContractTypes(
            point as Record<string, unknown>,
            FORM_FIELD_SKETCH_POINT_FIELDS,
            `${settingsLabel}.${key}[].points`,
          );
        }
      }
    }
  }
}

/**
 * The first page of `projects.list`, fetched once and shared.
 *
 * Two tests need it, and every avoidable request costs latency against a
 * rate-limited, occasionally slow upstream.
 */
let firstProjectPagePromise: ReturnType<typeof flex.projects.list> | undefined;
function firstProjectPage(): ReturnType<typeof flex.projects.list> {
  firstProjectPagePromise ??= flex.projects.list({ limit: 1, page: 1 });
  return firstProjectPagePromise;
}

/**
 * The whole user roster, fetched once and shared.
 *
 * `users.list` takes no paging parameters and answers with the entire roster,
 * which can be large, so the two tests that need it must not fetch it twice.
 */
let userRosterPromise: ReturnType<typeof flex.users.list> | undefined;
function userRoster(): ReturnType<typeof flex.users.list> {
  userRosterPromise ??= flex.users.list();
  return userRosterPromise;
}

/**
 * The equipment types, fetched once and shared.
 *
 * Two tests need them: one to validate the `EquipmentType` shape, the other to
 * get the `equipmentType_id` that `equipments.list` requires.
 */
let equipmentTypesPromise:
  | ReturnType<typeof flex.equipmenttypes.list>
  | undefined;
function equipmentTypes(): ReturnType<typeof flex.equipmenttypes.list> {
  equipmentTypesPromise ??= flex.equipmenttypes.list();
  return equipmentTypesPromise;
}

/**
 * The first page of `contractors.list`, fetched once and shared.
 *
 * Two tests need it: one to validate the `Contractor` shape, the other to get
 * the `contractor_id` that `contractor-contacts.list` requires.
 */
let firstContractorPagePromise:
  | ReturnType<typeof flex.contractors.list>
  | undefined;
function firstContractorPage(): ReturnType<typeof flex.contractors.list> {
  firstContractorPagePromise ??= flex.contractors.list({ limit: 1, page: 1 });
  return firstContractorPagePromise;
}

/**
 * The first page of `contractor-requirements.list`, fetched once and shared.
 *
 * Two tests need it: one for the `ContractorRequirement` shape, the other for
 * the `requirement_id` that `contractor-requirement.info` requires.
 */
let firstRequirementPagePromise:
  | ReturnType<typeof flex.contractorRequirements.list>
  | undefined;
function firstRequirementPage(): ReturnType<
  typeof flex.contractorRequirements.list
> {
  firstRequirementPagePromise ??= flex.contractorRequirements.list({
    limit: 1,
    page: 1,
  });
  return firstRequirementPagePromise;
}

/**
 * The equipment of the first equipment type, fetched once and shared.
 *
 * Two tests need it: `equipments.list` for the `Equipment` shape, and
 * `inspections.list` for an `equipment_id` to ask about. It resolves to
 * `undefined` when the account has no equipment types at all, since there is
 * then nothing to filter by.
 */
type EquipmentPage = Awaited<ReturnType<typeof flex.equipments.list>>;
let firstTypeEquipmentsPromise: Promise<EquipmentPage | undefined> | undefined;
function firstTypeEquipments(): Promise<EquipmentPage | undefined> {
  firstTypeEquipmentsPromise ??= equipmentTypes().then(async (types) => {
    const equipmentTypeId = types.equipmenttypes[0]?.id;
    if (equipmentTypeId === undefined) return undefined;
    return await flex.equipments.list({ equipmentType_id: equipmentTypeId });
  });
  return firstTypeEquipmentsPromise;
}

/**
 * Every form on the account, fetched once and shared.
 *
 * `forms.list` takes no paging parameters and answers with the whole catalog,
 * and four tests need it: the `FormSummary` shape, the `form_id` that
 * `forms.info` takes, and the search for a form that has a response.
 */
let formsPromise: ReturnType<typeof flex.forms.list> | undefined;
function formsList(): ReturnType<typeof flex.forms.list> {
  formsPromise ??= flex.forms.list();
  return formsPromise;
}

/** The largest `count()` the live test will still verify by a one-page walk. */
const PAGED_WALK_LIMIT = 1000;

/** How many forms the search below is willing to ask about. */
const RESPONSE_SEARCH_LIMIT = 5;

/** The outcome of the search for a form that has at least one response. */
interface ResponseSearch {
  /** How many forms were asked, capped at {@link RESPONSE_SEARCH_LIMIT}. */
  readonly searched: number;
  /** The first form that had a response, with its first page of one. */
  readonly match:
    | {
        readonly formId: number;
        readonly page: Awaited<ReturnType<typeof flex.responses.list>>;
      }
    | undefined;
}

/**
 * The first form that has a response, fetched once and shared.
 *
 * `responses.list` requires a `form_id`, and a form may have no responses at
 * all, so three tests — `responses.list`, `responses.info`, and
 * `responses.flat` — share one bounded search rather than each running its own.
 * Every request asks for a single response.
 */
let responseSearchPromise: Promise<ResponseSearch> | undefined;
function responseSearch(): Promise<ResponseSearch> {
  responseSearchPromise ??= (async () => {
    const forms = await formsList();
    const candidates = forms.forms.slice(0, RESPONSE_SEARCH_LIMIT);
    let searched = 0;
    for (const form of candidates) {
      const formId = form.id;
      searched += 1;
      const page = await flex.responses.list({
        form_id: formId,
        limit: 1,
        page: 1,
      });
      expect(page.ok).toBe(true);
      if (page.responses.length > 0)
        return { searched, match: { formId, page } };
    }
    return { searched, match: undefined };
  })();
  return responseSearchPromise;
}

/**
 * The acknowledgments, fetched once and shared.
 *
 * Two tests need them: one for the `Acknowledgment` shape, the other for the
 * `id` that `acknowledgments.info` requires. The method takes no paging
 * parameters, so this is the whole set.
 */
let acknowledgmentsPromise:
  | ReturnType<typeof flex.acknowledgments.list>
  | undefined;
function acknowledgmentsList(): ReturnType<typeof flex.acknowledgments.list> {
  acknowledgmentsPromise ??= flex.acknowledgments.list();
  return acknowledgmentsPromise;
}

/**
 * The training catalog, fetched once and shared.
 *
 * Two tests need it: one for the `Training` shape, the other for the
 * `training_id` that filters `completedtrainings.v2.list`. The method takes no
 * paging parameters, so this is the whole catalog.
 */
let trainingsPromise: ReturnType<typeof flex.trainings.list> | undefined;
function trainingsList(): ReturnType<typeof flex.trainings.list> {
  trainingsPromise ??= flex.trainings.list();
  return trainingsPromise;
}

/**
 * The establishments, fetched once and shared.
 *
 * Two tests need them: one for the `Establishment` shape, the other for the
 * `establishment_id` that `establishments.info` requires.
 */
let establishmentsPromise:
  | ReturnType<typeof flex.establishments.list>
  | undefined;
function establishmentsList(): ReturnType<typeof flex.establishments.list> {
  establishmentsPromise ??= flex.establishments.list();
  return establishmentsPromise;
}

/**
 * The custom data lists, fetched once and shared.
 *
 * Two tests need them: one for the `DataList` shape, the other for the
 * `data_list_id` that `datalistitems.list` requires. The method takes no paging
 * parameters, so this is every list at once.
 */
let dataListsPromise: ReturnType<typeof flex.datalists.list> | undefined;
function dataLists(): ReturnType<typeof flex.datalists.list> {
  dataListsPromise ??= flex.datalists.list();
  return dataListsPromise;
}

describe("api.ping", () => {
  it("answers a valid token with ok: true", async () => {
    const result = await flex.call("api.ping");
    expect(result.ok).toBe(true);
  });

  it("answers the same way through the api namespace", async () => {
    const result = await flex.api.ping();
    expect(result.ok).toBe(true);
  });
});

describe("api.echo", () => {
  it("returns the echoed object as the whole response body", async () => {
    const echoed = { ok: true, echoed: "novara-flex-js" } as const;
    const result = await flex.api.echo({ response: echoed });

    // The vendor replaces the envelope with the echoed object, so the SDK's
    // classification applies to it: `ok: true` is what makes this resolve.
    expect(result.ok).toBe(true);
    expect(result.echoed).toBe("novara-flex-js");
  });
});

describe("account.info", () => {
  it("returns an account object matching the contract", async () => {
    const result = await flex.account.info();

    expect(result.ok).toBe(true);
    const account = result.account as Record<string, unknown>;
    expect(isPlainObject(account)).toBe(true);
    // Absent fields are skipped, so make sure the table is not checking nothing.
    expect(
      Object.keys(ACCOUNT_FIELDS.checks).filter((field) => field in account)
        .length,
    ).toBeGreaterThan(0);
    expectContractTypes(account, ACCOUNT_FIELDS, "account");

    const metafields = account.userMetafields;
    if (Array.isArray(metafields)) {
      for (const metafield of metafields) {
        expectContractTypes(
          metafield as Record<string, unknown>,
          ACCOUNT_METAFIELD_FIELDS,
          "account.userMetafields[]",
        );
      }
    }
  });
});

describe("users.list", () => {
  it("returns an array of user objects matching the contract", async () => {
    const result = await userRoster();

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.users)).toBe(true);
    expect(result.users.every(isPlainObject)).toBe(true);
    if ("columns" in result) {
      expect(isStringArray(result.columns)).toBe(true);
    }

    const [user] = result.users;
    expect(isPlainObject(user)).toBe(true);
    expectContractTypes(user as Record<string, unknown>, USER_FIELDS, "user");
  });
});

describe("users.info", () => {
  it("returns the single user named by an id from the roster", async () => {
    const roster = await userRoster();
    const id = roster.users[0]?.id;
    if (id === undefined) {
      // Nothing to look up on this account; users.list already asserted shape.
      expect(roster.users).toHaveLength(0);
      return;
    }

    const result = await flex.users.info({ id });

    expect(result.ok).toBe(true);
    const user = result.user as Record<string, unknown>;
    expect(isPlainObject(user)).toBe(true);
    // Compared as a boolean so a failure can never print a live identifier.
    expect(
      user.id === id,
      "users.info returned a user whose id is not the one requested",
    ).toBe(true);
    expectContractTypes(user, USER_FIELDS, "user");
  });
});

describe("roles.list", () => {
  it("returns an array of role objects matching the contract", async () => {
    const result = await flex.roles.list();

    expect(result.ok).toBe(true);
    expectContractItems(result.roles, ROLE_FIELDS, "role");
  });
});

describe("jobtitles.list", () => {
  it("returns an array of job title objects matching the contract", async () => {
    const result = await flex.jobtitles.list();

    expect(result.ok).toBe(true);
    expectContractItems(result.jobtitles, JOB_TITLE_FIELDS, "jobtitle");
  });
});

describe("fieldoffices.list", () => {
  it("returns an array of field office objects matching the contract", async () => {
    const result = await flex.fieldoffices.list();

    expect(result.ok).toBe(true);
    expectContractItems(
      result.fieldoffices,
      FIELD_OFFICE_FIELDS,
      "fieldoffice",
    );
  });
});

describe("linesofbusiness.list", () => {
  it("returns an array of line of business objects matching the contract", async () => {
    const result = await flex.linesofbusiness.list();

    expect(result.ok).toBe(true);
    expectContractItems(
      result.linesofbusiness,
      LINE_OF_BUSINESS_FIELDS,
      "lineofbusiness",
    );
  });
});

describe("companies.list", () => {
  it("returns an array of company objects matching the contract", async () => {
    const result = await flex.companies.list();

    expect(result.ok).toBe(true);
    expectContractItems(result.companies, COMPANY_FIELDS, "company");
  });
});

describe("projects.list", () => {
  it("honors limit and returns paging metadata", async () => {
    const result = await firstProjectPage();

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.projects)).toBe(true);
    expect(result.projects.length).toBeLessThanOrEqual(1);

    expectPaging(result, "projects.list");

    const [project] = result.projects;
    expect(isPlainObject(project)).toBe(true);
    expectContractTypes(
      project as Record<string, unknown>,
      PROJECT_FIELDS,
      "project",
    );
  });

  it("pages through results with the page parameter", async () => {
    const first = await firstProjectPage();
    const total = first.paging.total;
    if (total <= 1) {
      // Nothing to page through on this account; the limit assertion above
      // already covered the single-page case.
      expect(first.projects.length).toBeLessThanOrEqual(1);
      return;
    }

    const second = await flex.call("projects.list", { limit: 1, page: 2 });
    expect(second.projects).toHaveLength(1);
    expect(second.projects[0]?.id).not.toBe(first.projects[0]?.id);
  });
});

describe("projects.list through listAll", () => {
  it("walks exactly two pages with .pages() and stops on break", async () => {
    const limit = 2;
    const pages: Awaited<ReturnType<typeof flex.projects.list>>[] = [];
    for await (const page of flex.projects.listAll({ limit }).pages()) {
      pages.push(page);
      if (pages.length === 2) break;
    }

    const [first, second] = pages;
    expect(first?.ok).toBe(true);
    const total = first?.paging.total ?? 0;
    const lastPage = first?.paging.last_page ?? 0;
    expect(isInteger(total)).toBe(true);
    expect(lastPage).toBe(Math.ceil(total / limit));
    // An account with at most one page of projects ends the walk after it.
    expect(pages.length).toBe(Math.min(2, Math.max(1, lastPage)));
    if (second === undefined) return;

    expect(first?.projects.length).toBe(limit);
    expect(second.ok).toBe(true);
    expect(second.projects.length).toBeGreaterThan(0);
    expect(second.projects.length).toBeLessThanOrEqual(limit);
    const firstIds = new Set(first?.projects.map((p) => p.id));
    expect(
      second.projects.some((p) => firstIds.has(p.id)),
      "page 2 repeated a project from page 1",
    ).toBe(false);
  });
});

describe("projects.info", () => {
  it("returns the single project named by an id from the first page", async () => {
    const first = await firstProjectPage();
    const id = first.projects[0]?.id;
    if (id === undefined) {
      // Nothing to look up on this account; projects.list asserted the shape.
      expect(first.projects).toHaveLength(0);
      return;
    }

    const result = await flex.projects.info({ project_id: id });

    expect(result.ok).toBe(true);
    const project = result.project as Record<string, unknown>;
    expect(isPlainObject(project)).toBe(true);
    // Compared as a boolean so a failure can never print a live identifier.
    expect(
      project.id === id,
      "projects.info returned a project whose id is not the one requested",
    ).toBe(true);
    expectContractTypes(project, PROJECT_FIELDS, "project");

    // The contract leaves an attachment entry open; all it promises is that
    // each one is an object. An empty array leaves that unverified.
    const attachments = project.attachments;
    if (Array.isArray(attachments) && attachments.length > 0) {
      expect(
        attachments.every(isPlainObject),
        "project.attachments holds a non-object",
      ).toBe(true);
    }
  });
});

describe("equipmenttypes.list", () => {
  it("returns an array of equipment type objects matching the contract", async () => {
    const result = await equipmentTypes();

    expect(result.ok).toBe(true);
    expectContractItems(
      result.equipmenttypes,
      EQUIPMENT_TYPE_FIELDS,
      "equipmenttype",
    );

    const first = result.equipmenttypes[0] as
      | Record<string, unknown>
      | undefined;
    if (first === undefined) return;

    const metafields = first.metafields;
    if (Array.isArray(metafields)) {
      for (const metafield of metafields) {
        expectContractTypes(
          metafield as Record<string, unknown>,
          EQUIPMENT_METAFIELD_FIELDS,
          "equipmenttype.metafields[]",
        );
      }
    }

    if ("schedules" in first) {
      expect(
        isObjectArray(first.schedules),
        "equipmenttype.schedules does not match the type declared in the contract",
      ).toBe(true);
    }

    // Every type's schedules, since most types may have none. No schedule has
    // been observed on the wire yet, so these checks run only once one appears.
    for (const type of result.equipmenttypes) {
      for (const schedule of type.schedules) {
        expectContractTypes(
          schedule,
          EQUIPMENT_TYPE_SCHEDULE_FIELDS,
          "equipmenttype.schedules[]",
        );
        if (isPlainObject(schedule.trigger)) {
          expectContractTypes(
            schedule.trigger as Record<string, unknown>,
            EQUIPMENT_SCHEDULE_TRIGGER_FIELDS,
            "equipmenttype.schedules[].trigger",
          );
        }
      }
    }
  });
});

describe("equipments.list", () => {
  it("returns the equipment of the first equipment type", async () => {
    const result = await firstTypeEquipments();
    if (result === undefined) {
      // No equipment types configured, so there is nothing to filter by.
      expect((await equipmentTypes()).equipmenttypes).toHaveLength(0);
      return;
    }

    expect(result.ok).toBe(true);
    expectContractItems(result.equipments, EQUIPMENT_FIELDS, "equipment");

    const first = result.equipments[0] as Record<string, unknown> | undefined;
    if (first === undefined) return;

    const schedules = first.schedules;
    if (Array.isArray(schedules)) {
      for (const schedule of schedules) {
        expectContractTypes(
          schedule as Record<string, unknown>,
          EQUIPMENT_SCHEDULE_STATUS_FIELDS,
          "equipment.schedules[]",
        );
      }
    }

    const projects = first.projects;
    if (Array.isArray(projects)) {
      for (const project of projects) {
        expectContractTypes(
          project as Record<string, unknown>,
          EQUIPMENT_PROJECT_FIELDS,
          "equipment.projects[]",
        );
      }
    }
  });
});

describe("contractors.list", () => {
  it("honors limit and returns contractors matching the contract", async () => {
    const result = await firstContractorPage();

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.contractors)).toBe(true);
    expect(result.contractors.length).toBeLessThanOrEqual(1);

    expectPaging(result, "contractors.list");

    expectContractItems(result.contractors, CONTRACTOR_FIELDS, "contractor");
  });
});

describe("contractor-contacts.list", () => {
  it("returns the contacts of a contractor from the first page", async () => {
    const first = await firstContractorPage();
    const contractorId = first.contractors[0]?.id;
    if (contractorId === undefined) {
      // No contractors on this account, so there is nothing to ask about.
      expect(first.contractors).toHaveLength(0);
      return;
    }

    const result = await flex.contractorContacts.list({
      contractor_id: contractorId,
    });

    expect(result.ok).toBe(true);
    expectContractItems(
      result.contacts,
      CONTRACTOR_CONTACT_FIELDS,
      "contractorcontact",
    );
  });
});

describe("contractor-requirements.list", () => {
  it("honors limit and returns requirements matching the contract", async () => {
    const result = await firstRequirementPage();

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.requirements)).toBe(true);
    expect(result.requirements.length).toBeLessThanOrEqual(1);

    expectPaging(result, "contractor-requirements.list");

    expectContractItems(
      result.requirements,
      CONTRACTOR_REQUIREMENT_FIELDS,
      "contractorrequirement",
    );
  });
});

describe("contractor-requirement.info", () => {
  it("returns the contractor statuses of a requirement from the first page", async () => {
    const first = await firstRequirementPage();
    const requirementId = first.requirements[0]?.id;
    if (requirementId === undefined) {
      // No requirements configured, so there is nothing to look up.
      expect(first.requirements).toHaveLength(0);
      return;
    }

    // The SDK folds the vendor's singular area onto the plural namespace.
    const result = await flex.contractorRequirements.info({
      requirement_id: requirementId,
    });

    expect(result.ok).toBe(true);
    // Compared as a boolean so a failure can never print a live identifier.
    expect(
      result.requirement_id === requirementId,
      "contractor-requirement.info returned a requirement_id that is not the one requested",
    ).toBe(true);

    expect(
      Array.isArray(result.contractors),
      "contractor-requirement.info contractors is not an array",
    ).toBe(true);
    expect(
      result.contractors.every(isPlainObject),
      "contractor-requirement.info contractors holds a non-object",
    ).toBe(true);

    const [contractor] = result.contractors;
    if (contractor === undefined) return;
    expectContractTypes(
      contractor as Record<string, unknown>,
      REQUIREMENT_CONTRACTOR_FIELDS,
      "contractorrequirement.contractors[]",
    );
  });
});

describe("formfolders.list", () => {
  it("returns an array of form folder objects matching the contract", async () => {
    const result = await flex.formfolders.list();

    expect(result.ok).toBe(true);
    expectContractItems(result.folders, FORM_FOLDER_FIELDS, "formfolder");
  });
});

describe("forms.list", () => {
  it("returns an array of form summaries matching the contract", async () => {
    const result = await formsList();

    expect(result.ok).toBe(true);
    expectContractItems(result.forms, FORM_SUMMARY_FIELDS, "form");
  });
});

describe("forms.info", () => {
  it("returns the definition of a form from the catalog", async () => {
    const forms = await formsList();
    const formId = forms.forms[0]?.id;
    if (formId === undefined) {
      // No forms on this account; forms.list already asserted the envelope.
      expect(forms.forms).toHaveLength(0);
      return;
    }

    const result = await flex.forms.info({
      form_id: formId,
      include_versions: true,
    });

    expect(result.ok).toBe(true);
    const form = result.form as Record<string, unknown>;
    expect(isPlainObject(form)).toBe(true);
    // Compared as a boolean so a failure can never print a live identifier.
    expect(
      form.id === formId,
      "forms.info returned a form whose id is not the one requested",
    ).toBe(true);
    expectContractTypes(form, FORM_DETAIL_FIELDS, "form");

    // `latest` is the current version: its number, and the field definitions
    // whose ids key a flattened `responses.flat` row. `include_versions` adds
    // the earlier versions, which share the `FormField` union.
    expectFormVersion(form.latest, "form.latest");
    for (const version of result.form.versions ?? []) {
      expectFormVersion(version, "form.versions[]");
    }
  });

  it("types every field of a spread of forms by its type, in every version", async () => {
    // The first form above covers only the field types it happens to use, so
    // two more from the middle and the end of the catalog widen the net for
    // an unseen type or a settings shape that drifted. Two requests.
    const forms = (await formsList()).forms;
    const picks = new Set([Math.floor(forms.length / 2), forms.length - 1]);
    picks.delete(0);
    for (const index of picks) {
      const formId = forms[index]?.id;
      if (formId === undefined) continue;
      const result = await flex.forms.info({
        form_id: formId,
        include_versions: true,
      });
      expect(result.ok).toBe(true);
      expectFormVersion(result.form.latest, "form.latest");
      for (const version of result.form.versions ?? []) {
        expectFormVersion(version, "form.versions[]");
      }
    }
  });
});

describe("responses.list", () => {
  it("honors limit and returns responses matching the contract", async () => {
    const search = await responseSearch();
    if (search.match === undefined) {
      // Every form asked answered `ok` with an empty page, so the FormResponse
      // shape stays unverified. Assert the search really ran.
      const forms = await formsList();
      expect(search.searched).toBe(
        Math.min(forms.forms.length, RESPONSE_SEARCH_LIMIT),
      );
      return;
    }

    const result = search.match.page;
    expect(result.ok).toBe(true);
    expect(Array.isArray(result.responses)).toBe(true);
    expect(result.responses.length).toBeLessThanOrEqual(1);

    expectPaging(result, "responses.list");

    // The top-level display title the contract requires.
    expect(
      isString(result.description),
      "responses.list description is absent or does not match the type declared in the contract",
    ).toBe(true);

    expectContractItems(result.responses, FORM_RESPONSE_FIELDS, "response");
    for (const response of result.responses) {
      expectResponseFollowups(response.fups, "response.fups");
    }
  });

  it("sends the latest revision on every response with latest: true", async () => {
    const search = await responseSearch();
    if (search.match === undefined) {
      expect(search.match).toBeUndefined();
      return;
    }

    const result = await flex.responses.list({
      form_id: search.match.formId,
      limit: 5,
      page: 1,
      latest: true,
    });

    expect(result.ok).toBe(true);
    expect(result.responses.length).toBeGreaterThan(0);
    for (const response of result.responses) {
      expectContractTypes(response, FORM_RESPONSE_FIELDS, "response");
      expect(
        "latest" in response,
        "responses.list with latest: true returned a response without latest",
      ).toBe(true);
      expectRevision(response.latest, "response.latest");
      expectResponseFollowups(response.fups, "response.fups");
    }
  });
});

describe("responses.info", () => {
  it("returns the single response named by an id from the first page", async () => {
    const search = await responseSearch();
    if (search.match === undefined) {
      expect(search.match).toBeUndefined();
      return;
    }

    const responseId = search.match.page.responses[0]?.id;
    if (responseId === undefined) {
      expect(search.match.page.responses[0]?.id).toBeUndefined();
      return;
    }

    const result = await flex.responses.info({ response_id: responseId });

    expect(result.ok).toBe(true);
    const response = result.response as Record<string, unknown>;
    expect(isPlainObject(response)).toBe(true);
    // Compared as a boolean so a failure can never print a live identifier.
    expect(
      response.id === responseId,
      "responses.info returned a response whose id is not the one requested",
    ).toBe(true);
    expectContractTypes(response, FORM_RESPONSE_FIELDS, "response");
    expectResponseFollowups(response.fups, "response.fups");
    // responses.info has sent latest on every response observed so far.
    expect(
      "latest" in response,
      "responses.info returned a response without latest",
    ).toBe(true);
    expectRevision(response.latest, "response.latest");
  });
});

describe("responses.flat", () => {
  it("returns flattened rows as JSON for the same form", async () => {
    const search = await responseSearch();
    if (search.match === undefined) {
      expect(search.match).toBeUndefined();
      return;
    }

    const result = await flex.responses.flat({
      form_id: search.match.formId,
      limit: 1,
    });

    expect(result.ok).toBe(true);

    expectPaging(result, "responses.flat");

    // The rows are keyed by the form's own field ids, so the contract keeps the
    // item open and this asserts the container, never a key or a value. With
    // `limit: 1` the wire carries the single data row plus the field-ID to
    // field-title mapping row the export puts in front of it.
    const rows = result.responses;
    expect(Array.isArray(rows), "responses.flat rows are not an array").toBe(
      true,
    );
    if (!Array.isArray(rows)) return;
    expect(
      rows.every(isPlainObject),
      "responses.flat rows hold a non-object",
    ).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(2);
    for (const row of rows) {
      expect(
        Object.values(row as Record<string, unknown>).every(
          (value) => value === null || isString(value) || isNumber(value),
        ),
        "a responses.flat row holds a value that is not a string, number, or null",
      ).toBe(true);
    }
  });
});

describe("responses.flat through flatAll", () => {
  it("repeats a page-scoped mapping row on every page and yields response rows only", async () => {
    const search = await responseSearch();
    const total = search.match?.page.paging.total ?? 0;
    if (search.match === undefined || total < 2) {
      // Two pages of one response each need a form with two responses.
      expect(total).toBeLessThan(2);
      return;
    }
    const params = { form_id: search.match.formId, limit: 1 };
    const allStrings = (row: unknown): boolean =>
      isPlainObject(row) &&
      Object.values(row as Record<string, unknown>).every(isString);

    const pages: Awaited<ReturnType<typeof flex.responses.flat>>[] = [];
    for await (const page of flex.responses.flatAll(params).pages()) {
      pages.push(page);
      if (pages.length === 2) break;
    }
    expect(pages.length).toBe(2);
    const rows = pages.map((page) => page.responses);
    // Every page leads with its own mapping row, not counted against limit.
    for (const pageRows of rows) {
      expect(pageRows.length).toBe(2);
      expect(allStrings(pageRows[0]), "a page lacks its mapping row").toBe(
        true,
      );
      // The row is page-scoped: it names exactly the columns on its page.
      const mappingKeys = Object.keys(pageRows[0] ?? {}).sort();
      const dataKeys = Object.keys(pageRows[1] ?? {}).sort();
      expect(
        JSON.stringify(mappingKeys) === JSON.stringify(dataKeys),
        "a mapping row does not cover exactly its page's columns",
      ).toBe(true);
    }

    const items: unknown[] = [];
    for await (const item of flex.responses.flatAll(params)) {
      items.push(item);
      if (items.length === 2) break;
    }
    // Only the two pages' response rows: no page's mapping row.
    const expected = [rows[0]?.[1], rows[1]?.[1]];
    expect(
      JSON.stringify(items) === JSON.stringify(expected),
      "flatAll yielded something other than the response rows",
    ).toBe(true);

    const skipped: unknown[] = [];
    for await (const item of flex.responses.flatAll({
      ...params,
      skip_field_id_mapping_json: true,
    })) {
      skipped.push(item);
      if (skipped.length === 1) break;
    }
    // With the row skipped by the vendor, nothing is stripped.
    expect(
      JSON.stringify(skipped) === JSON.stringify([rows[0]?.[1]]),
      "flatAll stripped a response row despite skip_field_id_mapping_json",
    ).toBe(true);
  });
});

describe("count through listAll and flatAll", () => {
  it("counts in one request what a walk yields, mapping row excluded", async () => {
    const search = await responseSearch();
    if (search.match === undefined) {
      expect(search.searched).toBeLessThanOrEqual(RESPONSE_SEARCH_LIMIT);
      return;
    }
    const form_id = search.match.formId;

    const listCount = await flex.responses.listAll({ form_id }).count();
    expect(isInteger(listCount)).toBe(true);
    expect(
      listCount === search.match.page.paging.total,
      "responses.list count() disagrees with paging.total at limit 1",
    ).toBe(true);

    const flatCount = await flex.responses.flatAll({ form_id }).count();
    const skippedCount = await flex.responses
      .flatAll({ form_id, skip_field_id_mapping_json: true })
      .count();
    expect(
      flatCount === skippedCount,
      "responses.flat paging.total depends on the mapping row",
    ).toBe(true);
    expect(
      flatCount === listCount,
      "responses.flat and responses.list count the same form differently",
    ).toBe(true);

    // Bounded: a form of at most 1000 responses is one flatAll page.
    if (flatCount > PAGED_WALK_LIMIT) return;
    let rows = 0;
    for await (const _row of flex.responses.flatAll({ form_id })) rows += 1;
    expect(
      rows === flatCount,
      "count() disagrees with the number of rows flatAll yields",
    ).toBe(true);
  });
});

describe("followups.list", () => {
  it("returns follow-ups matching the contract, message threads included", async () => {
    const result = await flex.followups.list({ limit: 1 });

    expect(result.ok).toBe(true);
    expect(result.followups.length).toBeLessThanOrEqual(1);

    expectPaging(result, "followups.list");

    expectContractItems(result.followups, FOLLOWUP_FIELDS, "followup");

    const messages = result.followups[0]?.messages;
    if (!Array.isArray(messages)) return;
    for (const message of messages) {
      const record = message as Record<string, unknown>;
      // `signature` is untyped in the contract, so it is deliberately unchecked.
      expectContractTypes(
        record,
        FOLLOWUP_MESSAGE_FIELDS,
        "followup.messages[]",
      );

      const attachments = record.attachments;
      if (!Array.isArray(attachments)) continue;
      for (const attachment of attachments) {
        expectContractTypes(
          attachment as Record<string, unknown>,
          FOLLOWUP_ATTACHMENT_FIELDS,
          "followup.messages[].attachments[]",
        );
      }
    }
  });
});

describe("followup_display_id", () => {
  it("is accepted by followups.list, responses.list, and responses.info", async () => {
    // Each call would throw NovaraFlexApiError (`parameter_invalid` or
    // `parameter_unexpected`) if the vendor rejected the flag, so reaching the
    // assertions is itself the check that the documented parameter is accepted.
    const followups = await flex.followups.list({
      limit: 1,
      followup_display_id: true,
    });
    expect(followups.ok).toBe(true);
    // With the flag set, the vendor sends the display ID on every follow-up.
    for (const followup of followups.followups) {
      expect(
        isString(followup.followup_display_id),
        "followup.followup_display_id is missing or does not match the type declared in the contract",
      ).toBe(true);
    }

    const search = await responseSearch();
    if (search.match === undefined) {
      expect(search.match).toBeUndefined();
      return;
    }

    const list = await flex.responses.list({
      form_id: search.match.formId,
      limit: 1,
      latest: true,
      followup_display_id: true,
    });
    expect(list.ok).toBe(true);

    const responseId = search.match.page.responses[0]?.id;
    if (responseId === undefined) {
      expect(search.match.page.responses[0]?.id).toBeUndefined();
      return;
    }
    const info = await flex.responses.info({
      response_id: responseId,
      followup_display_id: true,
    });
    expect(info.ok).toBe(true);
  });
});

describe("inspections.list", () => {
  it("returns the inspections of an equipment item", async () => {
    const equipment = await firstTypeEquipments();
    const equipmentId = equipment?.equipments[0]?.id;
    if (equipmentId === undefined) {
      // No equipment on the first equipment type, so there is nothing to ask
      // about; equipments.list already asserted its own envelope.
      expect(equipment?.equipments ?? []).toHaveLength(0);
      return;
    }

    const result = await flex.inspections.list({ equipment_id: equipmentId });

    expect(result.ok).toBe(true);
    expectContractItems(result.inspections, INSPECTION_FIELDS, "inspection");
  });
});

describe("acknowledgments.list", () => {
  it("returns an array of acknowledgment objects matching the contract", async () => {
    const result = await acknowledgmentsList();

    expect(result.ok).toBe(true);
    expectContractItems(
      result.acknowledgments,
      ACKNOWLEDGMENT_FIELDS,
      "acknowledgment",
    );
  });
});

describe("acknowledgments.info", () => {
  it("returns the acknowledgment named by an id from the list, recipients included", async () => {
    const list = await acknowledgmentsList();
    const id = list.acknowledgments[0]?.id;
    if (id === undefined) {
      // Nothing to look up on this account; the list asserted the envelope.
      expect(list.acknowledgments).toHaveLength(0);
      return;
    }

    // The vendor spells this parameter `id`, the way `users.info` does.
    const result = await flex.acknowledgments.info({ id });

    expect(result.ok).toBe(true);
    const acknowledgment = result.acknowledgment as Record<string, unknown>;
    expect(isPlainObject(acknowledgment)).toBe(true);
    // Compared as a boolean so a failure can never print a live identifier.
    expect(
      acknowledgment.id === id,
      "acknowledgments.info returned an acknowledgment whose id is not the one requested",
    ).toBe(true);
    expectContractTypes(
      acknowledgment,
      ACKNOWLEDGMENT_FIELDS,
      "acknowledgment",
    );

    // `recipients` is what `info` adds over `list`.
    const recipients = acknowledgment.recipients;
    if (!Array.isArray(recipients)) return;
    for (const recipient of recipients) {
      expectContractTypes(
        recipient as Record<string, unknown>,
        ACKNOWLEDGMENT_RECIPIENT_FIELDS,
        "acknowledgment.recipients[]",
      );
    }
  });
});

describe("trainings.v2.list", () => {
  it("returns an array of training objects matching the contract", async () => {
    const result = await trainingsList();

    expect(result.ok).toBe(true);
    expectContractItems(result.trainings, TRAINING_FIELDS, "training");

    // Every training's condition, since only a `limited` training has data.
    for (const training of result.trainings) {
      const condition = training.assigned_to_condition;
      expectContractTypes(
        condition,
        TRAINING_ASSIGNMENT_CONDITION_FIELDS,
        "training.assigned_to_condition",
      );
      if (isPlainObject(condition.data)) {
        expectContractTypes(
          condition.data as Record<string, unknown>,
          TRAINING_ASSIGNMENT_CONDITION_DATA_FIELDS,
          "training.assigned_to_condition.data",
        );
      }
    }
  });

  it("is the same endpoint through call under the versioned vendor name", async () => {
    // The SDK method name drops the `v2`; the vendor method name does not.
    const viaCall = await flex.call("trainings.v2.list");
    const viaNamespace = await trainingsList();

    expect(viaCall.ok).toBe(true);
    // Compared as a boolean so a failure can never print live data.
    expect(
      viaCall.trainings.length === viaNamespace.trainings.length,
      "trainings.v2.list answered differently through call than through the namespace",
    ).toBe(true);
  });
});

describe("completedtrainings.v2.list", () => {
  it("honors limit and returns paging metadata through the versioned vendor name", async () => {
    // Also the escape-hatch check: the SDK name drops the `v2`, `call` keeps it.
    const result = await flex.call("completedtrainings.v2.list", { limit: 5 });

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.completedtrainings)).toBe(true);
    expect(result.completedtrainings.length).toBeLessThanOrEqual(5);

    expectPaging(result, "completedtrainings.v2.list");

    expectContractItems(
      result.completedtrainings,
      COMPLETED_TRAINING_FIELDS,
      "completedtraining",
    );
  });

  it("filters by a training_id from the catalog", async () => {
    const trainings = await trainingsList();
    const trainingId = trainings.trainings[0]?.id;
    if (trainingId === undefined) {
      // No trainings configured, so there is nothing to filter by.
      expect(trainings.trainings).toHaveLength(0);
      return;
    }

    const result = await flex.completedtrainings.list({
      training_id: trainingId,
      limit: 5,
    });

    expect(result.ok).toBe(true);
    expect(result.completedtrainings.length).toBeLessThanOrEqual(5);
    // Compared as booleans so a failure can never print a live identifier.
    expect(
      result.completedtrainings.every(
        (record) => record.training_id === trainingId,
      ),
      "completedtrainings.v2.list returned a record for another training",
    ).toBe(true);
    expectContractItems(
      result.completedtrainings,
      COMPLETED_TRAINING_FIELDS,
      "completedtraining",
    );

    // The contract leaves an attachment entry open; all it promises is that
    // each one is an object. An empty array leaves that unverified.
    const files = result.completedtrainings[0]?.files;
    if (Array.isArray(files) && files.length > 0) {
      expect(
        files.every(isPlainObject),
        "completedtraining.files holds a non-object",
      ).toBe(true);
    }
  });
});

describe("grouptrainings.list", () => {
  it("returns an array of group training objects matching the contract", async () => {
    const result = await flex.grouptrainings.list();

    expect(result.ok).toBe(true);
    expectContractItems(
      result.grouptrainings,
      GROUP_TRAINING_FIELDS,
      "grouptraining",
    );
  });
});

describe("training-employee-status.list", () => {
  it("honors limit and returns the roll-up with its last_updated stamp", async () => {
    const result = await flex.trainingEmployeeStatus.list({ limit: 5 });

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.employees)).toBe(true);
    expect(result.employees.length).toBeLessThanOrEqual(5);

    // The vendor may serve these results from a cache up to 15 minutes old, and
    // says so with a top-level timestamp the contract requires.
    expect(
      isInteger(result.last_updated),
      "training-employee-status.list last_updated is absent or does not match the type declared in the contract",
    ).toBe(true);

    expectPaging(result, "training-employee-status.list");

    expectContractItems(
      result.employees,
      TRAINING_EMPLOYEE_STATUS_FIELDS,
      "trainingemployeestatus",
    );

    const lastCompleted = result.employees[0]?.last_completed;
    if (!Array.isArray(lastCompleted)) return;
    for (const completion of lastCompleted) {
      expectContractTypes(
        completion as Record<string, unknown>,
        TRAINING_COMPLETION_STATUS_FIELDS,
        "trainingemployeestatus.last_completed[]",
      );
    }
  });
});

describe("driver-qualifications.list", () => {
  it("returns qualified employees and their requirements", async () => {
    // Also the escape-hatch check for a hyphenated area: the property is
    // camelCased, the vendor method name keeps its hyphen.
    const result = await flex.call("driver-qualifications.list");

    expect(result.ok).toBe(true);
    // The result array is named `users`, not `drivers`.
    expectContractItems(
      result.users,
      DRIVER_QUALIFICATION_USER_FIELDS,
      "driverqualificationuser",
    );

    const requirements = result.users[0]?.requirements;
    if (!Array.isArray(requirements)) return;
    for (const requirement of requirements) {
      expectContractTypes(
        requirement as Record<string, unknown>,
        DRIVER_QUALIFICATION_REQUIREMENT_FIELDS,
        "driverqualificationuser.requirements[]",
      );
    }
  });
});

describe("responses.flat as CSV", () => {
  it("returns one page of CSV with its paging headers", async () => {
    const search = await responseSearch();
    if (search.match === undefined) {
      expect(search.match).toBeUndefined();
      return;
    }

    const page = await flex.responses.flatCsv({
      form_id: search.match.formId,
      limit: 1,
    });

    // Booleans only: the document holds live answers.
    expect(typeof page.csv === "string" && page.csv.length > 0).toBe(true);
    expect(page.paging !== undefined).toBe(true);
    expect(isInteger(page.paging?.total)).toBe(true);
    expect(isInteger(page.paging?.last_page)).toBe(true);
    // The CSV and JSON exports count the same responses (2026-09-29).
    expect(page.paging?.total === search.match.page.paging?.total).toBe(true);
  });
});

describe("osha-hours.list as CSV", () => {
  it("returns one page of CSV with the novaraflex- paging headers", async () => {
    const page = await flex.oshaHours.listCsv({ limit: 1 });

    expect(typeof page.csv === "string" && page.csv.length > 0).toBe(true);
    // Observed 2026-09-29: this method sends `novaraflex-total-results` and
    // `novaraflex-last-page`, not the `kpaehs-` pair the vendor's docs name.
    expect(page.paging !== undefined).toBe(true);
    expect(isInteger(page.paging?.total)).toBe(true);
    expect(isInteger(page.paging?.last_page)).toBe(true);
  });
});

describe("osha-hours.list", () => {
  it("honors limit and returns JSON hours records matching the contract", async () => {
    // JSON only: the wrapper narrows `format` away from the vendor's CSV.
    const result = await flex.oshaHours.list({ limit: 5 });

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.hours)).toBe(true);
    expect(result.hours.length).toBeLessThanOrEqual(5);

    expectPaging(result, "osha-hours.list");

    expectContractItems(result.hours, OSHA_HOURS_ENTRY_FIELDS, "oshahours");
  });
});

describe("establishments.list", () => {
  it("returns an array of establishment objects matching the contract", async () => {
    // The vendor labels this area coming soon; the live API answers it anyway.
    const result = await establishmentsList();

    expect(result.ok).toBe(true);
    expectContractItems(
      result.establishments,
      ESTABLISHMENT_FIELDS,
      "establishment",
    );
  });
});

describe("establishments.info", () => {
  it("returns the establishment named by an id from the list, inside an array", async () => {
    const list = await establishmentsList();
    const establishmentId = list.establishments[0]?.id;
    if (establishmentId === undefined) {
      // Nothing to look up on this account; the list asserted the envelope.
      expect(list.establishments).toHaveLength(0);
      return;
    }

    const result = await flex.establishments.info({
      establishment_id: establishmentId,
    });

    expect(result.ok).toBe(true);
    // The container really is an array holding the single match, which is what
    // the contract declares and what nothing here unwraps.
    expect(
      Array.isArray(result.establishment),
      "establishments.info establishment is not an array",
    ).toBe(true);
    expect(result.establishment.length).toBeLessThanOrEqual(1);

    const [establishment] = result.establishment;
    if (establishment === undefined) return;
    // Compared as a boolean so a failure can never print a live identifier.
    expect(
      establishment.id === establishmentId,
      "establishments.info returned an establishment whose id is not the one requested",
    ).toBe(true);
    expectContractTypes(
      establishment as Record<string, unknown>,
      ESTABLISHMENT_FIELDS,
      "establishment",
    );
  });
});

describe("datalists.list", () => {
  it("returns an array of data list objects matching the contract", async () => {
    const result = await dataLists();

    expect(result.ok).toBe(true);
    expectContractItems(result.datalists, DATA_LIST_FIELDS, "datalist");
  });
});

describe("datalistitems.list", () => {
  it("returns the items of the first data list, each naming that list", async () => {
    const lists = await dataLists();
    const dataListId = lists.datalists[0]?.id;
    if (dataListId === undefined) {
      // No custom data lists on this account; the list asserted the envelope.
      expect(lists.datalists).toHaveLength(0);
      return;
    }

    // Also the escape-hatch check for this area: `call` and the namespace
    // wrapper reach the same endpoint with the same required parameter.
    const result = await flex.call("datalistitems.list", {
      data_list_id: dataListId,
    });

    expect(result.ok).toBe(true);
    expectContractItems(
      result.datalistitems,
      DATA_LIST_ITEM_FIELDS,
      "datalistitem",
    );

    // Compared as a boolean so a failure can never print a live identifier.
    expect(
      result.datalistitems.every((item) => item.data_list_id === dataListId),
      "datalistitems.list returned an item belonging to another data list",
    ).toBe(true);

    // The two flags widen the result rather than narrow it, so the inclusive
    // call can only return at least as many items as the default one.
    const inclusive = await flex.datalistitems.list({
      data_list_id: dataListId,
      include_deleted: true,
      include_inactive: true,
    });
    expect(inclusive.ok).toBe(true);
    expect(
      inclusive.datalistitems.length >= result.datalistitems.length,
      "datalistitems.list returned fewer items with include_deleted and include_inactive set",
    ).toBe(true);
  });
});

describe("resources.list", () => {
  it("returns resources whose versions match the inline contract shape", async () => {
    const result = await flex.resources.list();

    expect(result.ok).toBe(true);
    expectContractItems(result.resources, RESOURCE_FIELDS, "resource");

    for (const resource of result.resources) {
      const versions = resource.versions;
      if (!Array.isArray(versions)) continue;
      for (const version of versions) {
        expectContractTypes(
          version as Record<string, unknown>,
          RESOURCE_VERSION_FIELDS,
          "resource.versions[]",
        );
      }
    }
  });
});

describe("resourcetags.list", () => {
  it("returns the tags under the vendor's resourcetags key", async () => {
    const result = await flex.resourcetags.list();

    expect(result.ok).toBe(true);
    // The container is named after the method, not after the `ResourceCategory`
    // schema the vendor's prose describes. The contract follows the wire.
    expectContractItems(
      result.resourcetags,
      RESOURCE_CATEGORY_FIELDS,
      "resourcetag",
    );
  });
});

describe("dataload.info", () => {
  /**
   * A well-formed 24-character hex id that cannot name a real data load.
   *
   * There is no `dataload.list`, and the only way to obtain a real id is to
   * call `dataload.create`, which writes to the account and can send email.
   * So this suite never obtains one: the unknown id is the whole live surface
   * this area gets.
   */
  const UNKNOWN_DATALOAD_ID = "000000000000000000000000";

  it("rejects an unknown data-load id with a NovaraFlexApiError", async () => {
    const failure = await flex.dataload.info({ id: UNKNOWN_DATALOAD_ID }).then(
      () => {
        throw new Error("dataload.info resolved for an id that cannot exist");
      },
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(NovaraFlexApiError);
    const apiError = failure as NovaraFlexApiError;
    expect(typeof apiError.code).toBe("string");
    // Observed 2026-09-21. Unlike `contractor-requirement.info`, which answers
    // `server_error` for an id it cannot resolve, this method reports the
    // documented not-found code.
    expect(apiError.code).toBe("content_not_found");
    expect(apiError.method).toBe("dataload.info");

    // `includes(...)` is asserted as a boolean so a failure can never print a
    // token or any other live value.
    const serialized = `${apiError.message}${JSON.stringify(apiError)}`;
    expect(
      serialized.includes(live.token),
      "dataload.info leaked the token through its error",
    ).toBe(false);
  });
});

/** How many follow-ups the attachment-key search looks through: one page. */
const ATTACHMENT_SEARCH_LIMIT = 100;

/** The outcome of the search for an attachment key. */
interface AttachmentSearch {
  /** How many follow-ups the one page held. */
  readonly searched: number;
  /** The first attachment key found, or `undefined`. Never print it. */
  readonly key: string | undefined;
}

/**
 * The first attachment key on the first page of follow-ups, fetched once.
 * Follow-up messages are the one place the contract exposes attachment keys;
 * a single page bounds the search.
 */
let attachmentSearchPromise: Promise<AttachmentSearch> | undefined;
function attachmentSearch(): Promise<AttachmentSearch> {
  attachmentSearchPromise ??= (async () => {
    const result = await flex.followups.list({
      limit: ATTACHMENT_SEARCH_LIMIT,
    });
    expect(result.ok).toBe(true);
    for (const followup of result.followups) {
      for (const message of followup.messages ?? []) {
        const attachments = (message as { attachments?: unknown }).attachments;
        if (!Array.isArray(attachments)) continue;
        for (const attachment of attachments) {
          const key = (attachment as { key?: unknown }).key;
          if (typeof key === "string" && key.length > 0) {
            return { searched: result.followups.length, key };
          }
        }
      }
    }
    return { searched: result.followups.length, key: undefined };
  })();
  return attachmentSearchPromise;
}

describe("attachment.load", () => {
  it("downloads a follow-up attachment through its redirect", async (ctx) => {
    const search = await attachmentSearch();
    if (search.key === undefined) {
      // The search really ran; the account simply has no attachment on the
      // first page of follow-ups, so there is nothing to download.
      expect(isInteger(search.searched)).toBe(true);
      ctx.skip();
      return;
    }

    const file = await flex.attachment.load({ key: search.key });

    // Booleans only: the bytes are a real person's upload.
    expect(file.data instanceof Blob).toBe(true);
    expect(file.data.size > 0).toBe(true);
    expect(typeof file.contentType === "string").toBe(true);
    const mediaType = file.contentType.split(";")[0]?.trim().toLowerCase();
    expect(mediaType !== undefined && mediaType.length > 0).toBe(true);
    expect(mediaType === "text/html").toBe(false);
  });

  it("rejects an unknown key with a NovaraFlexApiError", async () => {
    // Well-formed but invented: it names no upload on any account.
    const unknownKey = "000000000000000000000000/public/invented/none.bin";
    const failure = await flex.attachment.load({ key: unknownKey }).then(
      () => {
        throw new Error("attachment.load resolved for a key that cannot exist");
      },
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(NovaraFlexApiError);
    const apiError = failure as NovaraFlexApiError;
    // Observed 2026-09-29: HTTP 200 with an error envelope, no redirect.
    expect(apiError.code).toBe("invalid_key_for_customer");
    expect(apiError.method).toBe("attachment.load");

    const serialized = `${apiError.message}${JSON.stringify(apiError)}`;
    expect(
      serialized.includes(live.token),
      "attachment.load leaked the token through its error",
    ).toBe(false);
    expect(serialized.includes(unknownKey)).toBe(false);
  });
});

describe("authentication failures", () => {
  it("rejects an invalid token with a NovaraFlexApiError", async () => {
    // Goes through `createClient` like every other client, so it is observed
    // too. It has its own throttle instance, but it makes a single request.
    const bogus = createClient(INVALID_TOKEN);

    const failure = await bogus.call("api.ping").then(
      () => {
        throw new Error("api.ping resolved for an invalid token");
      },
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(NovaraFlexApiError);
    const apiError = failure as NovaraFlexApiError;
    expect(typeof apiError.code).toBe("string");
    expect(apiError.code.length).toBeGreaterThan(0);
    // Observed 2026-09-13. The vendor protocol page shows `invalid_token` in an
    // example; the live wire and the contract both say `token_invalid`.
    expect(apiError.code).toBe("token_invalid");
    expect(apiError.method).toBe("api.ping");

    // `includes(...)` is asserted as a boolean so a failure can never print a token.
    const serialized = `${apiError.message}${JSON.stringify(apiError)}`;
    expect(serialized.includes(INVALID_TOKEN)).toBe(false);
  });

  it("keeps the live token out of the client's serialization", () => {
    expect(JSON.stringify(flex).includes(live.token)).toBe(false);
    expect(Object.keys(flex)).not.toContain("token");
  });
});
