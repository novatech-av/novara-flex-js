/**
 * The `grouptrainings.*` area: training sessions completed by a group of
 * trainees at once.
 *
 * Reached through {@link NovaraFlexClient.grouptrainings}, never constructed
 * directly. See `./index.ts` for the naming convention these resource classes
 * follow.
 */

import type {
  NovaraFlexCallArgs,
  NovaraFlexClient,
  NovaraFlexResult,
} from "../client.js";

/** The `grouptrainings.*` Novara Flex methods, exposed as `flex.grouptrainings`. */
export class GroupTrainingsResource {
  /** Type-only import: the client is injected, so there is no runtime cycle. */
  readonly #client: NovaraFlexClient;

  constructor(client: NovaraFlexClient) {
    this.#client = client;
  }

  /**
   * Returns the completed group trainings.
   *
   * Every parameter is optional: the method takes no filters and no paging
   * parameters, so it answers with every group training at once. Each one names
   * its `m_instructor_id`, the `m_trainees_id` who attended, and the
   * `trainings_id` that the session covered. A group training's `id` is what a
   * completion record from {@link CompletedTrainingsResource.list} points back
   * to through `group_training_id`.
   *
   * @see https://api.novaraflex.com/docs/method/grouptrainings.list
   */
  list(
    ...rest: NovaraFlexCallArgs<"grouptrainings.list">
  ): Promise<NovaraFlexResult<"grouptrainings.list">> {
    return this.#client.call("grouptrainings.list", ...rest);
  }
}
