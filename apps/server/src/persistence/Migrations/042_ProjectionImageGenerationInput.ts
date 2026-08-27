import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Stores the normalized request used to create each image generation so the
 * client can offer an exact, reusable JSON payload for completed images.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    ALTER TABLE projection_image_generations
    ADD COLUMN input_json TEXT
  `;
});
