/**
 * Endpoint-oriented resource namespaces.
 *
 * `NovaraFlexClient` exposes one readonly property per Novara Flex API area,
 * each holding a resource object with one method per vendor method, so
 * `flex.call("account.info")` can also be written `flex.account.info()`.
 *
 * The naming convention every area added here must follow:
 *
 * - The **namespace** is the vendor method name's segment before the first
 *   dot: `users.list` lives on `flex.users`, `responses.flat` on
 *   `flex.responses`. The namespace keeps the vendor's spelling exactly.
 * - The **method** is the rest of the name after that first dot, minus any
 *   vendor version segment, camelCased if what is left contains a hyphen or an
 *   underscore: `users.list` is `flex.users.list()` and `trainings.v2.list` is
 *   `flex.trainings.list()`.
 * - One module per area, `src/resources/<area>.ts`, exporting a single
 *   `<Area>Resource` class with hand-written methods — no factory, no Proxy —
 *   each carrying a JSDoc summary and the vendor's documentation URL.
 * - File names and client property names keep the vendor's spelling verbatim
 *   (`jobtitles.ts`, `flex.jobtitles`), while class names restore the word
 *   boundaries in readable PascalCase (`JobTitlesResource`).
 * - An area whose vendor name contains a **hyphen or an underscore** is the one
 *   exception to that verbatim rule: a hyphen cannot appear in a dotted
 *   property, so the client property is camelCased
 *   (`contractor-contacts` → `flex.contractorContacts`) while the file name
 *   keeps the vendor's spelling (`contractor-contacts.ts`). Un-hyphenated areas
 *   are still verbatim: `flex.jobtitles` stays `flex.jobtitles`.
 * - When the vendor splits one resource across a **singular and a plural area**
 *   (`contractor-requirement.info` and `contractor-requirements.list`), both
 *   methods live on the plural namespace:
 *   `flex.contractorRequirements.info()` and `.list()`. The fold is a naming
 *   convenience only — the vendor method name is unchanged everywhere it is a
 *   *value*: the string passed to `call`, the `@see` documentation URL, and the
 *   `method` an error reports. `flex.call("contractor-requirement.info", …)`
 *   keeps working exactly as before.
 * - When the vendor **versions a method** (`trainings.v2.list`,
 *   `completedtrainings.v2.list`), the version segment is dropped from the SDK
 *   method name: `flex.trainings.list()`, `flex.completedtrainings.list()`. This
 *   too is naming only — the versioned name is what goes on the wire, what
 *   `call` takes, and what an error reports. Nothing collides today: the
 *   deprecated `trainings.list` has no path in the contract. Should the vendor
 *   publish a `v3`, the wrapper moves to it and every older version stays
 *   reachable through `call`.
 * - Every method is a thin delegation to `NovaraFlexClient.call`: it takes the
 *   same arguments minus the method name and returns the method's full
 *   `ok: true` success body. Nothing is unwrapped, so paging metadata and any
 *   undocumented field stay reachable.
 * - A method that answers with something other than JSON cannot delegate to
 *   `call`, which parses every body as JSON; it delegates to `requestRaw` in
 *   `../internal/raw.ts`, which runs the same request loop. A vendor method
 *   that serves **JSON or CSV** by a `format` parameter keeps its JSON wrapper
 *   with `format` narrowed to `"json"`, and gains a companion named
 *   `<method>Csv` (`flex.responses.flatCsv()`, `flex.oshaHours.listCsv()`) that
 *   takes the same parameters minus `format`, sends `format: "csv"` itself, and
 *   resolves to one `NovaraFlexCsvPage`. A method that answers only with a
 *   file, `attachment.load`, is wrapped under its own name and resolves to a
 *   `NovaraFlexAttachment`.
 * - Every **paged** method — one that takes `limit` and a 1-based `page` and
 *   answers with `paging` — gets a companion named `<method>All` next to its
 *   wrapper: `flex.projects.listAll()`, `flex.responses.flatAll()`. It takes
 *   exactly the wrapper's arguments and is another hand-written one-line
 *   delegation, to `paginate` in `../internal/paginate.ts`, which returns a
 *   lazy `NovaraFlexPaginator`: `for await` yields the items, `.pages()` the
 *   full success bodies, and `.count()` the total in one request. A new
 *   paged method needs an entry in that module's `PAGED_METHODS` table — its
 *   item key, which the compiler checks against the contract, and its
 *   live-confirmed `limit` maximum, the default page size — as well as the
 *   companion.
 * - Resource classes are internal. They are not exported from `src/index.ts`;
 *   consumers reach them through the client property, e.g. `flex.api`.
 *
 * Every area in the contract has a namespace; `call` remains the escape hatch
 * for any method the vendor adds before it gets a wrapper.
 */

export { AccountResource } from "./account.js";
export { AcknowledgmentsResource } from "./acknowledgments.js";
export { ApiResource } from "./api.js";
export { AttachmentResource } from "./attachment.js";
export { CompaniesResource } from "./companies.js";
export { CompletedTrainingsResource } from "./completedtrainings.js";
export { ContractorContactsResource } from "./contractor-contacts.js";
export { ContractorRequirementsResource } from "./contractor-requirements.js";
export { ContractorsResource } from "./contractors.js";
export { DataListItemsResource } from "./datalistitems.js";
export { DataListsResource } from "./datalists.js";
export { DataLoadResource } from "./dataload.js";
export { DriverQualificationsResource } from "./driver-qualifications.js";
export { EquipmentsResource } from "./equipments.js";
export { EquipmentTypesResource } from "./equipmenttypes.js";
export { EstablishmentsResource } from "./establishments.js";
export { FieldOfficesResource } from "./fieldoffices.js";
export { FollowupsResource } from "./followups.js";
export { FormFoldersResource } from "./formfolders.js";
export { FormsResource } from "./forms.js";
export { GroupTrainingsResource } from "./grouptrainings.js";
export { InspectionsResource } from "./inspections.js";
export { JobTitlesResource } from "./jobtitles.js";
export { LinesOfBusinessResource } from "./linesofbusiness.js";
export { OshaHoursResource } from "./osha-hours.js";
export { ProjectsResource } from "./projects.js";
export { ResourcesResource } from "./resources.js";
export { ResourceTagsResource } from "./resourcetags.js";
export { ResponsesResource } from "./responses.js";
export { RolesResource } from "./roles.js";
export { TrainingEmployeeStatusResource } from "./training-employee-status.js";
export { TrainingsResource } from "./trainings.js";
export { UsersResource } from "./users.js";
